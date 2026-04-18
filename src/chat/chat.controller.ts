import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { AuthGuard } from '@nestjs/passport';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
  ) {}

  /** GET /api/chat/:rideId/messages?limit=50&before=<uuid> */
  @Get(':rideId/messages')
  async getMessages(
    @Param('rideId') rideId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const take = Math.min(parseInt(limit || '50', 10) || 50, 100);

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.ride_id = :rideId', { rideId })
      .orderBy('m.created_at', 'DESC')
      .take(take);

    if (before) {
      const ref = await this.msgRepo.findOne({ where: { id: before } });
      if (ref) {
        qb.andWhere('m.created_at < :before', { before: ref.createdAt });
      }
    }

    const messages = await qb.getMany();

    return messages.reverse().map((m) => ({
      id: m.id,
      ride_id: m.rideId,
      sender_id: m.senderId,
      sender_role: m.senderRole,
      text: m.text,
      is_voice: m.isVoice,
      is_edited: m.isEdited,
      created_at: m.createdAt.toISOString(),
    }));
  }
}
