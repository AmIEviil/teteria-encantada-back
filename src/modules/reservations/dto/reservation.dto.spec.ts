import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReservationDto } from './create-reservation.dto';
import { UpdateReservationDto } from './update-reservation.dto';
import { GetReservationsDto } from './get-reservations.dto';
import { UpdateReservationScheduleDto } from './update-reservation-schedule.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Reservation DTOs', () => {
  it('CreateReservationDto valido', async () => {
    const dto = plainToInstance(CreateReservationDto, {
      tableId: uuid,
      reservedFor: '2026-07-01T12:00:00Z',
      peopleCount: 2,
      holderName: 'Ana',
      email: 'a@x.com',
      phone: '+56912345678',
      guestNames: ['Bob'],
      notes: 'n',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateReservationDto rechaza telefono invalido', async () => {
    const dto = plainToInstance(CreateReservationDto, {
      tableId: uuid,
      reservedFor: '2026-07-01T12:00:00Z',
      peopleCount: 2,
      phone: 'abc',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateReservationDto parcial valido', async () => {
    const dto = plainToInstance(UpdateReservationDto, {
      peopleCount: 3,
      waitingUntil: '2026-07-01T13:00:00Z',
      status: 'ACTIVE',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('GetReservationsDto valido', async () => {
    const dto = plainToInstance(GetReservationsDto, {
      tableId: uuid,
      status: 'ACTIVE',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateReservationScheduleDto valido', async () => {
    const dto = plainToInstance(UpdateReservationScheduleDto, {
      days: [{ dayOfWeek: 1, isOpen: true, opensAt: '10:00', closesAt: '23:00' }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateReservationScheduleDto rechaza dia fuera de rango', async () => {
    const dto = plainToInstance(UpdateReservationScheduleDto, {
      days: [{ dayOfWeek: 9, isOpen: false }],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
