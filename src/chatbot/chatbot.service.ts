import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly CHATBOT_API_URL: string;

  constructor(private readonly config: ConfigService) {
    this.CHATBOT_API_URL =
      this.config.get<string>('CHATBOT_API_URL') ?? 'http://localhost:8007';
  }

  async chat(body: { message: string; session_id?: string }) {
    this.logger.log(`Chat request: ${body.message.substring(0, 50)}...`);

    try {
      const response = await axios.post(`${this.CHATBOT_API_URL}/chat`, body);
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async createTicket(body: {
    question: string;
    session_id?: string;
    category?: string;
    language?: string;
  }) {
    this.logger.log(
      `Create ticket request: ${body.question.substring(0, 50)}...`,
    );

    try {
      const response = await axios.post(
        `${this.CHATBOT_API_URL}/tickets`,
        body,
      );
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async listTickets(params?: { status?: string; limit?: number }) {
    this.logger.log(`List tickets request`);

    try {
      const response = await axios.get(`${this.CHATBOT_API_URL}/tickets`, {
        params,
      });
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async getTicket(ticketId: string) {
    this.logger.log(`Get ticket request: ${ticketId}`);

    try {
      const response = await axios.get(
        `${this.CHATBOT_API_URL}/tickets/${ticketId}`,
      );
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async resolveTicket(
    ticketId: string,
    body: { answer: string; category?: string },
  ) {
    this.logger.log(`Resolve ticket request: ${ticketId}`);

    try {
      const response = await axios.patch(
        `${this.CHATBOT_API_URL}/tickets/${ticketId}/resolve`,
        body,
      );
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async health() {
    this.logger.log(`Health check request`);

    try {
      const response = await axios.get(`${this.CHATBOT_API_URL}/health`);
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async stats() {
    this.logger.log(`Stats request`);

    try {
      const response = await axios.get(`${this.CHATBOT_API_URL}/stats`);
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }

  async submitFeedback(body: {
    rating: number;
    session_id?: string;
    ticket_id?: string;
    helpful?: boolean;
    comment?: string;
  }) {
    this.logger.log(`Submit feedback request - rating: ${body.rating}`);

    try {
      const response = await axios.post(
        `${this.CHATBOT_API_URL}/feedback`,
        body,
      );
      this.logger.log(`Chatbot API responded with status ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Chatbot API error: ${error.message}`);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `Response data: ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw error;
    }
  }
}
