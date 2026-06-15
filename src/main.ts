import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

import * as bodyParser from 'body-parser';
import * as express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  // ─── Ensure folders exist ─────────────────────
  const publicDir = join(process.cwd(), 'public');
  const wellKnownDir = join(publicDir, '.well-known');

  if (!existsSync(wellKnownDir)) {
    mkdirSync(wellKnownDir, { recursive: true });
  }

  const uploadDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // ─── Static files ─────────────────────────────
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  app.useStaticAssets(publicDir);

  // IMPORTANT: explicit fix for .well-known (ANDROID ASSET LINKS)
  app.use(
    '/.well-known',
    express.static(join(process.cwd(), 'public/.well-known')),
  );

  // ─── Body parsers ─────────────────────────────
  app.use(
    bodyParser.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  // ─── CORS ─────────────────────────────────────
  // ─── CORS ─────────────────────────────────────
// ─── CORS ─────────────────────────────────────
app.enableCors({
  origin: [
    'https://web-admin-dashboard-pfe-main.onrender.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://admin.moviroo.tn', // 🆕 ajouter ça

  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Device-Name',
    'X-Device-Id',
    'ngrok-skip-browser-warning',
    
  ],
});

  app.set('trust proxy', true);

  // API prefix (IMPORTANT: AFTER static setup)
  app.setGlobalPrefix('api');

  // ─── Validation ───────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(3000);
  console.log('🚀 Backend running on http://localhost:3000/api');
}

bootstrap();