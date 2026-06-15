import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('images')
export class Image {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Ruta del objeto dentro del bucket (ej: "images/uuid.png").
  @Column({ type: 'varchar', length: 512 })
  key!: string;

  // URL pública del objeto.
  @Column({ type: 'varchar', length: 1024 })
  url!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  // Tamaño en bytes.
  @Column({ type: 'int' })
  size!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
