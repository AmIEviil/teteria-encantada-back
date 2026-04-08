import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { OrderItem } from '../../orders/entities/order-item.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 40 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  price: number;

  @Column({ type: 'int', default: 0 })
  minimumQuantity: number;

  @Column({ type: 'int', default: 0 })
  currentQuantity: number;

  @Column({ type: 'int', default: 0 })
  maximumQuantity: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  orderItems: OrderItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
