import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LoyaltyReward } from './loyalty-reward.entity';

@Entity('loyalty_levels')
export class LoyaltyLevel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'int' })
  threshold!: number;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @OneToMany(() => LoyaltyReward, (reward) => reward.level)
  rewards!: LoyaltyReward[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
