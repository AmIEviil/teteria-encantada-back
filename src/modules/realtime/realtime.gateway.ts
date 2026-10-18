import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

export interface ReservationsChangedPayload {
  tableId?: string | null;
  reason: 'REMINDER_SENT' | 'CONFIRMED' | 'DECLINED' | 'NO_RESPONSE';
}

// El gateway emite a TODOS los clientes conectados, sin rooms ni auth. Por eso
// el payload lleva sólo ids y estado: nada de email del comprador, montos ni
// datos de asistentes.
export interface EventPurchaseChangedPayload {
  purchaseId: string;
  eventId: string;
  status: 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  },
})
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  emitReservationsChanged(payload: ReservationsChangedPayload): void {
    this.logger.log(
      `Emitiendo reservations:changed (${payload.reason}) mesa=${payload.tableId ?? 'n/a'}`,
    );
    this.server?.emit('reservations:changed', payload);
  }

  emitEventPurchaseChanged(payload: EventPurchaseChangedPayload): void {
    this.logger.log(
      `Emitiendo eventPurchase:changed (${payload.status}) compra=${payload.purchaseId}`,
    );
    this.server?.emit('eventPurchase:changed', payload);
  }
}
