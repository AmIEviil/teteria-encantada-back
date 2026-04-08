import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Trabajador } from './trabajador.entity';

@Entity('trabajador_documentos')
export class TrabajadorDocumento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trabajador_id', type: 'uuid' })
  trabajadorId: string;

  @ManyToOne(() => Trabajador, (trabajador) => trabajador.documentos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador: Trabajador;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 180 })
  nombreArchivo: string;

  @Column({ name: 'ruta_archivo', type: 'varchar', length: 255 })
  rutaArchivo: string;

  @Column({ name: 'tipo_mime', type: 'varchar', length: 120, nullable: true })
  tipoMime: string | null;

  @Column({ name: 'tamano_bytes', type: 'int', nullable: true })
  tamanoBytes: number | null;

  @Column({ name: 'descripcion', type: 'varchar', length: 180, nullable: true })
  descripcion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}