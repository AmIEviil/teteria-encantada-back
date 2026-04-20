import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { Image } from '../../images/entities/image.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';

interface ProductPriceHistorySnapshot {
  id: string;
  productId: string;
  changedBy: string;
  previousPrice: number;
  newPrice: number;
  changedAt: Date;
}

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
  isActive!: boolean;

  @Column({ name: 'image_id', type: 'uuid', nullable: true })
  imageId!: string | null;

  @ManyToOne(() => Image, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'image_id' })
  image?: Image | null;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  orderItems: OrderItem[];

  // Non-persistent field used to keep API response backwards-compatible.
  imageBase64?: string | null;

  // Non-persistent field used by product detail views.
  priceHistory?: ProductPriceHistorySnapshot[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
