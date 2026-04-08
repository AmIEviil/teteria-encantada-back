import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { Product } from '../../products/entities/product.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.orderItems, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  subtotal: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
