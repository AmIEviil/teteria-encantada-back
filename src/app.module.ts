import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ImagesModule } from './modules/images/images.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { MigrationsModule } from './modules/migrations/migrations.module';
import { EventsModule } from './modules/events/events.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { PublicModule } from './modules/public/public.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'TeteriaEncantada',
      autoLoadEntities: true,
      synchronize: true,
      // migrationsRun: true,
      extra: {
        max: 10, // <= conexiones máximas por instancia
        idleTimeoutMillis: 30000, // cierra conexiones inactivas tras 30s
      },
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      logging:
        process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : ['error'],
    }),
    ProductsModule,
    ImagesModule,
    LayoutsModule,
    OrdersModule,
    ReservationsModule,
    EventsModule,
    TrabajadoresModule,
    PublicModule,
    AuthModule,
    MigrationsModule,
    ScheduleModule.forRoot(),
    WhatsappModule,
    RealtimeModule,
    LoyaltyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
