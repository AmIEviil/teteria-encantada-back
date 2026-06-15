import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Image } from '../../images/entities/image.entity';
import { RestaurantTable } from '../../layouts/entities/restaurant-table.entity';

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum ReservationConfirmationStatus {
  NOT_SENT = 'NOT_SENT',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  NO_RESPONSE = 'NO_RESPONSE',
}

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableId: string;

  @ManyToOne(() => RestaurantTable, {
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'tableId' })
  table: RestaurantTable;

  @Column({ type: 'timestamptz' })
  reservedFor: Date;

  @Column({ type: 'timestamptz', nullable: true })
  waitingUntil: Date | null;

  @Column({ type: 'int', default: 1 })
  peopleCount: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  holderName: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  phone: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  guestNames: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.ACTIVE,
  })
  status: ReservationStatus;

  @Column({
    type: 'enum',
    enum: ReservationConfirmationStatus,
    default: ReservationConfirmationStatus.NOT_SENT,
  })
  confirmationStatus: ReservationConfirmationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  confirmationSentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmationRespondedAt: Date | null;

  @Column({ name: 'comprobante_image_id', type: 'uuid', nullable: true })
  comprobanteImageId: string | null;

  @ManyToOne(() => Image, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'comprobante_image_id' })
  comprobanteImage: Image | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
