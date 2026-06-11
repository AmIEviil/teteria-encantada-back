import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

export interface ReservationsChangedPayload {
  tableId?: string | null;
  reason: 'REMINDER_SENT' | 'CONFIRMED' | 'DECLINED' | 'NO_RESPONSE';
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
}
