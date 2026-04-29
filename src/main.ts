import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ─── Ensure upload folders exist ─────────────────────────────
  const uploadDirs = [join(process.cwd(), 'uploads', 'classes')];
  for (const dir of uploadDirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // ─── Serve uploaded files as static assets ────────────────────
  // Accessible at: /uploads/classes/filename.jpg
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // ─── Increase JSON body size limit ───────────────────────────
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(3000);
  console.log('🚀 Moviroo backend running on http://localhost:3000/api');
}
bootstrap();
