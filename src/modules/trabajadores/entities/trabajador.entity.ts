import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/db/numeric.transformer';
import { User } from '../../auth/entities/user.entity';

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

  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  // Solo rut y telefono son obligatorios para dar de alta un trabajador.
  @Column({ type: 'varchar', length: 80, nullable: true })
  comuna: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  direccion: string | null;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento: string | null;

  @Column({ type: 'int', nullable: true })
  edad: number | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  sueldo: number | null;

  @Column({ name: 'foto_url', type: 'varchar', length: 255, nullable: true })
  fotoUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
