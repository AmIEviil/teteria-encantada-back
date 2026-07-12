import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';

@Entity('loyalty_config')
export class LoyaltyConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'boolean', default: true })
  attendancePointsEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  purchasePointsEnabled!: boolean;

  // Puntos por unidad monetaria (ej: 0.01 => 1 pto cada 100).
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  purchasePointsRate!: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
