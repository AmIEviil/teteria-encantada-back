import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { User } from '../../auth/entities/user.entity';
import { TrabajadorDocumento } from './trabajador-documento.entity';

@Entity('trabajadores')
export class Trabajador {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, unique: true })
  rut: string;

  @Column({ type: 'varchar', length: 80 })
  comuna: string;

  @Column({ type: 'varchar', length: 120 })
  direccion: string;

  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  @Column({ name: 'fecha_nacimiento', type: 'date' })
  fechaNacimiento: string;

  @Column({ type: 'int' })
  edad: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  sueldo: number;

  @Column({ name: 'foto_url', type: 'varchar', length: 255, nullable: true })
  fotoUrl: string | null;

  @OneToMany(() => TrabajadorDocumento, (documento) => documento.trabajador, {
    cascade: true,
    eager: true,
    orphanedRowAction: 'delete',
  })
  documentos: TrabajadorDocumento[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}