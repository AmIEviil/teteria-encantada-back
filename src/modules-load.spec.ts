import { AppModule } from './app.module';
import AppDataSource from './data-source';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { ImagesModule } from './modules/images/images.module';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { MigrationsModule } from './modules/migrations/migrations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { PublicModule } from './modules/public/public.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

describe('Module definitions load', () => {
  it('todos los modulos estan definidos', () => {
    const modules = [
      AppModule,
      AuthModule,
      EventsModule,
      ImagesModule,
      LayoutsModule,
      MigrationsModule,
      OrdersModule,
      ProductsModule,
      PublicModule,
      RealtimeModule,
      ReservationsModule,
      TrabajadoresModule,
      WhatsappModule,
    ];
    for (const moduleClass of modules) {
      expect(typeof moduleClass).toBe('function');
    }
  });

  it('data-source esta configurado', () => {
    expect(AppDataSource).toBeDefined();
    expect(AppDataSource.options.type).toBe('postgres');
  });
});
