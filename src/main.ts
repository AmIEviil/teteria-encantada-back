import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { uploadsRoot } from './modules/images/storage/disk-storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT ?? '10mb';

  app.setGlobalPrefix('api');

  // Solo images/ es publico; ventas/ nunca se sirve como estatico.
  const imagesDir = join(uploadsRoot(), 'images');
  mkdirSync(imagesDir, { recursive: true });
  app.useStaticAssets(imagesDir, {
    prefix: '/api/uploads/images/',
    index: false,
  });
  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: [process.env.FRONTEND_URL || ''],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'User-Agent',
      'Request-Id',
      'traceparent',
      'Access-Control-Allow-Origin',
    ],
    credentials: true,
    maxAge: 3600, // Cache preflight for 1 hour
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
