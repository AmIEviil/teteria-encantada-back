import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('reservation_weekly_schedules')
@Unique('UQ_reservation_weekly_schedules_day_of_week', ['dayOfWeek'])
export class ReservationWeeklySchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  dayOfWeek: number;

  @Column({ type: 'boolean', default: true })
  isOpen: boolean;

  @Column({ type: 'varchar', length: 5, nullable: true })
  opensAt: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  closesAt: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
