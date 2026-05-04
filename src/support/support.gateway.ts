import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/support',
  cors: {
    origin: '*',
  },
})
export class SupportGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private userRooms = new Map<string, string>(); // socketId -> userId

  handleConnection(client: Socket) {
    const userId = this.getUserIdFromSocket(client);
    console.log(`[SupportGateway] Connection attempt - userId: ${userId}`);
    if (userId) {
      this.userRooms.set(client.id, userId);
      client.join(`user:${userId}`);
      console.log(`[SupportGateway] User ${userId} joined room user:${userId}`);
    } else {
      console.log(`[SupportGateway] Failed to extract userId from token`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.userRooms.get(client.id);
    if (userId) {
      this.userRooms.delete(client.id);
      client.leave(`user:${userId}`);
      console.log(`[SupportGateway] User ${userId} disconnected`);
    }
  }

  private getUserIdFromSocket(client: Socket): string | null {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return null;
      // Simple JWT decode - in production use proper JWT verification
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      return payload.sub || payload.id;
    } catch {
      return null;
    }
  }

  // Emit to a specific user
  emitToUser(userId: string, event: string, data: any) {
    console.log(
      `[SupportGateway] Emitting to user:${userId}, event: ${event}, data:`,
      data,
    );
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Emit to all admins (for admin panel)
  emitToAdmins(event: string, data: any) {
    this.server.emit(event, data);
  }
}
