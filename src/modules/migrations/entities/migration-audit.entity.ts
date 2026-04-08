import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum MigrationAuditAction {
  EXECUTE = 'EXECUTE',
  REVERT = 'REVERT',
}

@Entity('migration_audits')
export class MigrationAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'migration_name', type: 'varchar', length: 255 })
  migrationName: string;

  @Column({ type: 'varchar', length: 20 })
  action: MigrationAuditAction;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ default: true })
  success: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'executed_at', type: 'timestamptz' })
  executedAt: Date;
}
