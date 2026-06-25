import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LoyaltyTransactionType {
  EARN_PURCHASE = 'EARN_PURCHASE',
  EARN_ATTENDANCE = 'EARN_ATTENDANCE',
  REDEEM = 'REDEEM',
}

@Entity('loyalty_transactions')
@Index(['userId'])
export class LoyaltyTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: LoyaltyTransactionType })
  type!: LoyaltyTransactionType;

  // Positivo para EARN_*, negativo para REDEEM.
  @Column({ type: 'int' })
  points!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  referenceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  referenceId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
