import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { TableLayout } from './table-layout.entity';

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

@Entity('restaurant_tables')
@Unique('UQ_table_layout_code', ['layoutId', 'code'])
export class RestaurantTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  layoutId: string;

  @ManyToOne(() => TableLayout, (layout) => layout.tables, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'layoutId' })
  layout: TableLayout;

  @Column({ length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ type: 'int', default: 4 })
  capacity: number;

  @Column({ type: 'float' })
  positionX: number;

  @Column({ type: 'float' })
  positionY: number;

  @Column({ type: 'float', default: 110 })
  width: number;

  @Column({ type: 'float', default: 110 })
  height: number;

  @Column({ type: 'float', default: 0 })
  rotation: number;

  @Column({
    type: 'enum',
    enum: TableStatus,
    default: TableStatus.AVAILABLE,
  })
  status: TableStatus;

  @OneToMany(() => Order, (order) => order.table)
  orders: Order[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
