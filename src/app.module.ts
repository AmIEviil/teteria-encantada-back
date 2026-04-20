import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { MigrationsModule } from './modules/migrations/migrations.module';
import { EventsModule } from './modules/events/events.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { PublicModule } from './modules/public/public.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'TeteriaEncantada',
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
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
    LayoutsModule,
    OrdersModule,
    ReservationsModule,
    EventsModule,
    TrabajadoresModule,
    PublicModule,
    AuthModule,
    MigrationsModule,
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
