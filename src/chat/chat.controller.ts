import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { AuthGuard } from '@nestjs/passport';
import { LibreTranslateService } from './services/libre-translate.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
    private readonly libreTranslate: LibreTranslateService,
  ) {}

  /** GET /api/chat/:rideId/messages?limit=50&before=<uuid>&translate=true&lang=ar */
  @Get(':rideId/messages')
  async getMessages(
    @Param('rideId') rideId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('translate') translate?: string,
    @Query('lang') targetLang?: string,
  ) {
    const take = Math.min(parseInt(limit || '50', 10) || 50, 100);
    const shouldTranslate = translate === 'true' && targetLang;

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

    const result = await Promise.all(
      messages.map(async (m) => {
        let displayText = m.text;

        if (shouldTranslate && targetLang) {
          // Check if translation already exists
          const cachedTranslation = m.translations?.[targetLang];
          if (cachedTranslation) {
            displayText = cachedTranslation;
          } else {
            // Translate and cache
            try {
              const translated = await this.libreTranslate.translate(
                m.text,
                targetLang,
              );
              displayText = translated;

              // Save translation to DB
              const translations = m.translations || {};
              translations[targetLang] = translated;
              m.translations = translations;
              await this.msgRepo.save(m);
            } catch (err) {
              // On translation error, fall back to original text
              console.error(`Translation failed for message ${m.id}:`, err);
            }
          }
        }

        return {
          id: m.id,
          ride_id: m.rideId,
          sender_id: m.senderId,
          sender_role: m.senderRole,
          text: displayText,
          original_text: shouldTranslate ? m.text : undefined,
          is_voice: m.isVoice,
          is_edited: m.isEdited,
          created_at: m.createdAt.toISOString(),
        };
      }),
    );

    return result.reverse();
  }
}
