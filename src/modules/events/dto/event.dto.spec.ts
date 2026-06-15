import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { CreateEventTicketDto } from './create-event-ticket.dto';
import { UpdateEventDto } from './update-event.dto';
import { UpdateEventStatusDto } from './update-event-status.dto';
import { UpdateEventTicketDto } from './update-event-ticket.dto';
import { FindEventsDto } from './find-events.dto';
import { FindEventTicketsDto } from './find-event-tickets.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Event DTOs', () => {
  it('CreateEventDto entrada liberada valida', async () => {
    const dto = plainToInstance(CreateEventDto, {
      title: 'Fiesta',
      startsAt: '2026-07-01T20:00:00Z',
      endsAt: '2026-07-02T20:00:00Z',
      isFreeEntry: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateEventDto de pago exige tipos de ticket', async () => {
    const dto = plainToInstance(CreateEventDto, {
      title: 'Fiesta',
      startsAt: '2026-07-01T20:00:00Z',
      endsAt: '2026-07-02T20:00:00Z',
      isFreeEntry: false,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('CreateEventDto con tipo de ticket valido', async () => {
    const dto = plainToInstance(CreateEventDto, {
      title: 'Fiesta',
      startsAt: '2026-07-01T20:00:00Z',
      endsAt: '2026-07-02T20:00:00Z',
      isFreeEntry: false,
      ticketTypes: [{ name: 'General', price: 100, totalStock: 10 }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateEventTicketDto valido', async () => {
    const dto = plainToInstance(CreateEventTicketDto, {
      ticketTypeId: uuid,
      attendeeFirstName: 'Ana',
      attendeeLastName: 'Paz',
      attendanceDate: '2026-07-01',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateEventTicketDto rechaza uuid invalido', async () => {
    const dto = plainToInstance(CreateEventTicketDto, {
      ticketTypeId: 'no',
      attendeeFirstName: 'Ana',
      attendeeLastName: 'Paz',
      attendanceDate: '2026-07-01',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateEventDto parcial valido', async () => {
    const dto = plainToInstance(UpdateEventDto, { title: 'Nuevo' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateEventStatusDto valido', async () => {
    const dto = plainToInstance(UpdateEventStatusDto, { status: 'ENABLED' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateEventStatusDto invalido', async () => {
    const dto = plainToInstance(UpdateEventStatusDto, { status: 'X' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateEventTicketDto parcial valido', async () => {
    const dto = plainToInstance(UpdateEventTicketDto, {
      attendeeFirstName: 'Bob',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('FindEventsDto valido', async () => {
    const dto = plainToInstance(FindEventsDto, { status: 'ENABLED' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('FindEventTicketsDto valido', async () => {
    const dto = plainToInstance(FindEventTicketsDto, { status: 'ACTIVE' });
    expect(await validate(dto)).toHaveLength(0);
  });

  const fullTicketType = {
    name: 'VIP',
    description: 'd',
    price: 100,
    includesDetails: 'inc',
    menuMode: 'CUSTOMIZABLE',
    totalStock: 50,
    isPromotional: true,
    promoMinQuantity: 2,
    promoBundlePrice: 150,
    dailyStocks: [{ date: '2026-07-01', quantity: 10 }],
    menuTemplate: {
      groups: [
        {
          key: 'g',
          label: 'G',
          required: true,
          minSelect: 1,
          maxSelect: 2,
          options: [{ id: 'a', label: 'A', extraPrice: 5, isActive: true }],
        },
      ],
    },
  };

  it('CreateEventDto payload completo ejercita transformaciones anidadas', async () => {
    const dto = plainToInstance(CreateEventDto, {
      title: 'Full',
      description: 'd',
      officialImageUrl: 'http://i',
      status: 'ENABLED',
      startsAt: '2026-07-01T20:00:00Z',
      endsAt: '2026-07-02T20:00:00Z',
      isFreeEntry: false,
      ticketTypes: [fullTicketType],
    });
    await validate(dto);
    expect(dto.ticketTypes?.[0].dailyStocks?.[0].date).toBeInstanceOf(Date);
  });

  it('UpdateEventDto payload completo', async () => {
    const dto = plainToInstance(UpdateEventDto, {
      title: 'Full',
      startsAt: '2026-07-01T20:00:00Z',
      endsAt: '2026-07-02T20:00:00Z',
      isFreeEntry: false,
      ticketTypes: [fullTicketType],
    });
    await validate(dto);
    expect(dto.startsAt).toBeInstanceOf(Date);
  });

  it('CreateEventTicketDto payload completo', async () => {
    const dto = plainToInstance(CreateEventTicketDto, {
      ticketTypeId: uuid,
      attendeeFirstName: 'Ana',
      attendeeLastName: 'Paz',
      attendanceDate: '2026-07-01',
      price: 120,
      includesDetails: 'x',
      quantity: 2,
      applyPromotion: true,
      menuSelection: { groups: [{ groupKey: 'g', optionIds: ['a'] }] },
    });
    await validate(dto);
    expect(dto.attendanceDate).toBeInstanceOf(Date);
  });

  it('UpdateEventTicketDto payload completo', async () => {
    const dto = plainToInstance(UpdateEventTicketDto, {
      ticketTypeId: uuid,
      attendeeFirstName: 'Ana',
      attendeeLastName: 'Paz',
      attendanceDate: '2026-07-01',
      price: 120,
      status: 'ACTIVE',
      menuSelection: { groups: [{ groupKey: 'g', optionIds: ['a'] }] },
    });
    await validate(dto);
    expect(dto.attendanceDate).toBeInstanceOf(Date);
  });

  it('FindEventsDto con fechas', async () => {
    const dto = plainToInstance(FindEventsDto, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      search: 'x',
    });
    await validate(dto);
    expect(dto.startDate).toBeInstanceOf(Date);
  });

  it('FindEventTicketsDto con fecha y tipo', async () => {
    const dto = plainToInstance(FindEventTicketsDto, {
      ticketTypeId: uuid,
      attendanceDate: '2026-07-01',
    });
    await validate(dto);
    expect(dto.attendanceDate).toBeInstanceOf(Date);
  });
});
