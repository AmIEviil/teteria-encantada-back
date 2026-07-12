import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEventSessionDto } from './dto/create-event.dto';

describe('CreateEventSessionDto.name', () => {
  const base = { date: '2026-08-01', startTime: '10:00', capacity: 10 };

  it('accepts an optional name', async () => {
    const dto = plainToInstance(CreateEventSessionDto, {
      ...base,
      name: 'Cata de té',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('Cata de té');
  });

  it('is valid when name is omitted', async () => {
    const dto = plainToInstance(CreateEventSessionDto, base);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a name longer than 160 chars', async () => {
    const dto = plainToInstance(CreateEventSessionDto, {
      ...base,
      name: 'x'.repeat(161),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
