import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicCreateReservationDto } from './public-create-reservation.dto';
import { PublicFindReservationsDto } from './public-find-reservations.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Public DTOs', () => {
  it('PublicCreateReservationDto valido', async () => {
    const dto = plainToInstance(PublicCreateReservationDto, {
      tableId: uuid,
      reservedFor: '2026-07-01T12:00:00Z',
      peopleCount: 2,
      email: 'a@x.com',
      phone: '+56912345678',
      guestNames: ['Bob'],
      notes: 'n',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('PublicCreateReservationDto exige email', async () => {
    const dto = plainToInstance(PublicCreateReservationDto, {
      tableId: uuid,
      reservedFor: '2026-07-01T12:00:00Z',
      peopleCount: 2,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('PublicFindReservationsDto valido', async () => {
    const dto = plainToInstance(PublicFindReservationsDto, {
      email: 'a@x.com',
      status: 'ACTIVE',
      startDate: '2026-07-01',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
