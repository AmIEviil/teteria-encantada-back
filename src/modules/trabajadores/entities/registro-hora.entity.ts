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
import { Trabajador } from './trabajador.entity';

@Entity('registro_horas')
@Unique('uq_registro_horas_trabajador_fecha', ['trabajadorId', 'fecha'])
export class RegistroHora {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trabajador_id', type: 'uuid' })
  trabajadorId: string;

  @ManyToOne(() => Trabajador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador: Trabajador;

  @Column({ type: 'date' })
  fecha: string;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    transformer: numericTransformer,
  })
  horas: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
