import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatbotService } from './chatbot.service';

@Controller('chatbot')
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: { message: string; session_id?: string }) {
    this.logger.log(
      `chat called - message: ${body.message.substring(0, 50)}...`,
    );
    return this.chatbotService.chat(body);
  }

  @Post('tickets')
  @HttpCode(HttpStatus.OK)
  async createTicket(
    @Body()
    body: {
      question: string;
      session_id?: string;
      category?: string;
      language?: string;
    },
  ) {
    this.logger.log(
      `createTicket called - question: ${body.question.substring(0, 50)}...`,
    );
    return this.chatbotService.createTicket(body);
  }

  @Get('tickets')
  async listTickets(
    @Query('status') status?: string,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(`listTickets called - status: ${status}, limit: ${limit}`);
    return this.chatbotService.listTickets({ status, limit });
  }

  @Get('tickets/:ticketId')
  async getTicket(@Param('ticketId') ticketId: string) {
    this.logger.log(`getTicket called - ticketId: ${ticketId}`);
    return this.chatbotService.getTicket(ticketId);
  }

  @Patch('tickets/:ticketId/resolve')
  async resolveTicket(
    @Param('ticketId') ticketId: string,
    @Body() body: { answer: string; category?: string },
  ) {
    this.logger.log(`resolveTicket called - ticketId: ${ticketId}`);
    return this.chatbotService.resolveTicket(ticketId, body);
  }

  @Get('health')
  async health() {
    this.logger.log(`health called`);
    return this.chatbotService.health();
  }

  @Get('stats')
  async stats() {
    this.logger.log(`stats called`);
    return this.chatbotService.stats();
  }

  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Body()
    body: {
      rating: number;
      session_id?: string;
      ticket_id?: string;
      helpful?: boolean;
      comment?: string;
    },
  ) {
    this.logger.log(`submitFeedback called - rating: ${body.rating}`);
    return this.chatbotService.submitFeedback(body);
  }
}
