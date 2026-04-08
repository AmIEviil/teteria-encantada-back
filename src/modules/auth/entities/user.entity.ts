import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name', length: 80 })
  first_name: string;

  @Column({ name: 'last_name', type: 'varchar', length: 80, nullable: true })
  last_name: string | null;

  @Column({ type: 'varchar', unique: true, length: 60, nullable: true })
  username: string | null;

  @Column({ unique: true, length: 180 })
  email: string;

  @Column({ name: 'password_hash', length: 120 })
  passwordHash: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, (role) => role.users, {
    eager: true,
    nullable: false,
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({
    name: 'reset_password_token_hash',
    type: 'varchar',
    nullable: true,
    length: 64,
  })
  resetPasswordTokenHash: string | null;

  @Column({
    name: 'reset_password_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  resetPasswordExpiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
