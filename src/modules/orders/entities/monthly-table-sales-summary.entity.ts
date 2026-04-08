import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { RestaurantTable } from '../../layouts/entities/restaurant-table.entity';

@Entity('monthly_table_sales_summaries')
@Unique('UQ_monthly_sales_month_table', ['monthKey', 'tableId'])
export class MonthlyTableSalesSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 7 })
  monthKey: string;

  @Column()
  tableId: string;

  @ManyToOne(() => RestaurantTable, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'tableId' })
  table: RestaurantTable;

  @Column({ type: 'int', default: 0 })
  totalPaidOrders: number;

  @Column({ type: 'int', default: 0 })
  totalPaidItems: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  totalPaidSales: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastOrderAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
