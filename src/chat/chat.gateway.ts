import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

import { ChatMessage, SenderRole } from './entities/chat-message.entity';

interface SendPayload {
  ride_id: string;
  sender_id: string;
  sender_role: 'driver' | 'passenger';
  text: string;
  is_voice?: boolean;
}

interface EditPayload {
  message_id: string;
  ride_id: string;
  text: string;
}

interface DeletePayload {
  message_id: string;
  ride_id: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Chat client disconnected: ${client.id}`);
  }

  /* ── Join chat room for a ride ──────────────────────────── */
  @SubscribeMessage('chat:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ride_id: string },
  ) {
    if (!data?.ride_id) return;
    const room = `chat:${data.ride_id}`;
    client.join(room);
    this.logger.debug(`${client.id} joined ${room}`);
    return { event: 'chat:joined', data: { ride_id: data.ride_id } };
  }

  /* ── Leave chat room ────────────────────────────────────── */
  @SubscribeMessage('chat:leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ride_id: string },
  ) {
    if (!data?.ride_id) return;
    client.leave(`chat:${data.ride_id}`);
    return { event: 'chat:left', data: { ride_id: data.ride_id } };
  }

  /* ── Send a message ─────────────────────────────────────── */
  @SubscribeMessage('chat:send')
  async handleSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendPayload,
  ) {
    if (!payload?.ride_id || !payload?.sender_id || !payload?.text) {
      return { event: 'error', data: { message: 'Invalid chat payload' } };
    }

    const msg = this.msgRepo.create({
      rideId: payload.ride_id,
      senderId: payload.sender_id,
      senderRole: payload.sender_role as SenderRole,
      text: payload.text,
      isVoice: payload.is_voice ?? false,
    });

    const saved = await this.msgRepo.save(msg);

    const broadcast = {
      id: saved.id,
      ride_id: saved.rideId,
      sender_id: saved.senderId,
      sender_role: saved.senderRole,
      text: saved.text,
      is_voice: saved.isVoice,
      is_edited: false,
      created_at: saved.createdAt.toISOString(),
    };

    // Broadcast to everyone in the ride chat room (including sender)
    this.server.to(`chat:${payload.ride_id}`).emit('chat:message', broadcast);

    return { event: 'chat:sent', data: { id: saved.id } };
  }

  /* ── Edit a message ─────────────────────────────────────── */
  @SubscribeMessage('chat:edit')
  async handleEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: EditPayload,
  ) {
    if (!payload?.message_id || !payload?.text) {
      return { event: 'error', data: { message: 'Invalid edit payload' } };
    }

    await this.msgRepo.update(payload.message_id, {
      text: payload.text,
      isEdited: true,
    });

    this.server.to(`chat:${payload.ride_id}`).emit('chat:edited', {
      message_id: payload.message_id,
      text: payload.text,
      is_edited: true,
    });

    return { event: 'chat:edit_ok', data: { message_id: payload.message_id } };
  }

  /* ── Delete a message (hard delete) ─────────────────────── */
  @SubscribeMessage('chat:delete')
  async handleDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: DeletePayload,
  ) {
    if (!payload?.message_id) {
      return { event: 'error', data: { message: 'Invalid delete payload' } };
    }

    await this.msgRepo.delete(payload.message_id);

    this.server.to(`chat:${payload.ride_id}`).emit('chat:deleted', {
      message_id: payload.message_id,
    });

    return { event: 'chat:delete_ok', data: { message_id: payload.message_id } };
  }
}
