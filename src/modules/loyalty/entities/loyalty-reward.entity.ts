import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LoyaltyLevel } from './loyalty-level.entity';

export enum LoyaltyRewardType {
  DISCOUNT_CODE = 'DISCOUNT_CODE',
  FREE_WORKSHOP = 'FREE_WORKSHOP',
}

@Entity('loyalty_rewards')
export class LoyaltyReward {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  levelId!: string;

  @ManyToOne(() => LoyaltyLevel, (level) => level.rewards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'levelId' })
  level!: LoyaltyLevel;

  @Column({ type: 'enum', enum: LoyaltyRewardType })
  type!: LoyaltyRewardType;

  @Column({ type: 'varchar', length: 160 })
  description!: string;

  // Coste en puntos del canje (0 = beneficio de nivel sin descuento de saldo).
  @Column({ type: 'int', default: 0 })
  cost!: number;

  // Parámetros libres del premio (código, %dto, eventId, etc.).
  @Column({ type: 'jsonb', nullable: true })
  params!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
