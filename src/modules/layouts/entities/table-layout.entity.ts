import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RestaurantTable } from './restaurant-table.entity';

@Entity('table_layouts')
export class TableLayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => RestaurantTable, (restaurantTable) => restaurantTable.layout)
  tables: RestaurantTable[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
