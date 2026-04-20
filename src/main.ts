import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT ?? '10mb';

  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));

  app.enableCors({
    origin: true,
    credentials: true,
  });

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
