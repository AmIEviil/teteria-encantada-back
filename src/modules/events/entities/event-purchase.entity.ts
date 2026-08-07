import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';

export enum EventPurchaseStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  // Ventana del QR vencida sin pago (la fija el cron de PaymentsService).
  EXPIRED = 'EXPIRED',
  // El operador abortó el cobro desde el modal.
  CANCELLED = 'CANCELLED',
}

// Distingue el flujo que originó la compra. Lo usa el cron de expiración para
// no tocar las compras del sitio público, que no tienen ventana de tiempo.
export enum EventPurchaseOrigin {
  PUBLIC = 'PUBLIC',
  ADMIN_QR = 'ADMIN_QR',
}

// Snapshot mínimo de un item del carrito, suficiente para recrear el ticket.
export interface EventPurchaseItemSnapshot {
  ticketTypeId: string;
  sessionId: string | null;
  attendanceDate: string | null;
  attendeeFirstName: string;
  attendeeLastName: string;
  menuSelection: Record<string, unknown> | null;
}

@Entity('event_purchases')
export class EventPurchase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  eventId!: string;

  @Column({ type: 'varchar', length: 180 })
  buyerEmail!: string;

  @Column({ type: 'jsonb' })
  itemsSnapshot!: EventPurchaseItemSnapshot[];

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  total!: number;

  @Column({
    type: 'enum',
    enum: EventPurchaseStatus,
    default: EventPurchaseStatus.PENDING,
  })
  status!: EventPurchaseStatus;

  @Column({ type: 'varchar', length: 80, nullable: true })
  mpPaymentId!: string | null;

  @Column({
    type: 'enum',
    enum: EventPurchaseOrigin,
    default: EventPurchaseOrigin.PUBLIC,
  })
  origin!: EventPurchaseOrigin;

  @Column({ type: 'varchar', length: 80, nullable: true })
  mpPreferenceId!: string | null;

  @Column({ type: 'text', nullable: true })
  checkoutUrl!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
