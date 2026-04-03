import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  frontendUrl: process.env.FRONTEND_URL  ?? 'http://localhost:5173',
  backendUrl:  process.env.BACKEND_URL   ?? 'http://localhost:3000/api',
}));