import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventPurchasesService } from './event-purchases.service';
import {
  EventPurchase,
  EventPurchaseOrigin,
  EventPurchaseStatus,
} from '../events/entities/event-purchase.entity';
import { Event } from '../events/entities/event.entity';
import { EventTicketType } from '../events/entities/event-ticket-type.entity';
import { DiskStorageService } from '../images/storage/disk-storage.service';

const makeQb = () => {
  const qb: Record<string, jest.Mock> = {};
  [
    'andWhere',
    'where',
    'orderBy',
    'skip',
    'take',
    'select',
    'addSelect',
    'setParameters',
  ].forEach((m) => (qb[m] = jest.fn(() => qb)));
  qb.clone = jest.fn(() => qb);
  qb.getManyAndCount = jest.fn();
  qb.getMany = jest.fn();
  qb.getRawOne = jest.fn();
  return qb;
};

const buildPurchase = (o: Partial<EventPurchase> = {}): EventPurchase =>
  ({
    id: 'p-1',
    eventId: 'ev-1',
    buyerEmail: 'ana@mail.cl',
    itemsSnapshot: [
      {
        ticketTypeId: 'tt-1',
        sessionId: 's-1',
        attendanceDate: '2026-11-01',
        attendeeFirstName: 'Ana',
        attendeeLastName: 'Perez',
        menuSelection: null,
      },
    ],
    total: 20000,
    status: EventPurchaseStatus.PAID,
    mpPaymentId: '123',
    origin: EventPurchaseOrigin.PUBLIC,
    mpPayerId: 'payer-1',
    mpPayerName: 'Ana P',
    mpPaymentMethod: 'visa',
    paidAt: new Date('2026-10-01T12:00:00Z'),
    ticketsFileKey: 'ventas/a.pdf',
    receiptFileKey: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    ...o,
  }) as EventPurchase;

describe('EventPurchasesService', () => {
  let service: EventPurchasesService;
  let qb: ReturnType<typeof makeQb>;
  let purchaseRepo: Record<string, jest.Mock>;
  let eventRepo: Record<string, jest.Mock>;
  let ticketTypeRepo: Record<string, jest.Mock>;
  let storage: { getObject: jest.Mock };

  beforeEach(async () => {
    qb = makeQb();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    qb.getRawOne.mockResolvedValue({
      totalPurchases: '0',
      paidPurchases: '0',
      paidAmount: '0',
    });
    qb.getMany.mockResolvedValue([]);
    purchaseRepo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
    };
    eventRepo = { find: jest.fn().mockResolvedValue([]) };
    ticketTypeRepo = { find: jest.fn().mockResolvedValue([]) };
    storage = { getObject: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        EventPurchasesService,
        { provide: getRepositoryToken(EventPurchase), useValue: purchaseRepo },
        { provide: getRepositoryToken(Event), useValue: eventRepo },
        {
          provide: getRepositoryToken(EventTicketType),
          useValue: ticketTypeRepo,
        },
        { provide: DiskStorageService, useValue: storage },
      ],
    }).compile();
    service = mod.get(EventPurchasesService);
  });

  describe('list', () => {
    it('escapa %, _ en la busqueda y usa ILIKE ESCAPE', async () => {
      await service.list({ search: '50%_off' });
      expect(qb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({ q: '%50\\%\\_off%' }),
      );
      const sql = qb.andWhere.mock.calls.map((c) => c[0] as string).join(' ');
      expect(sql).toContain("ILIKE :q ESCAPE '\\'");
    });

    it('escapa la barra invertida', async () => {
      await service.list({ search: 'a\\b' });
      expect(qb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({ q: '%a\\\\b%' }),
      );
    });

    it('busqueda con mayusculas y espacios: trim y ILIKE (case-insensitive)', async () => {
      await service.list({ search: ' ANA@MAIL.CL ' });
      expect(qb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({ q: '%ANA@MAIL.CL%' }),
      );
    });

    it('search en blanco no agrega condicion', async () => {
      await service.list({ search: '  ' });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('filtra status, eventId y fechas con bound params', async () => {
      await service.list({
        status: EventPurchaseStatus.PAID,
        eventId: 'ev-1',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      const sql = qb.andWhere.mock.calls.map((c) => c[0] as string).join(' | ');
      expect(sql).toContain('p.status = :status');
      expect(sql).toContain('p."eventId" = :eventId');
      expect(sql).toContain(
        `(p."createdAt" AT TIME ZONE 'America/Santiago')::date >= :startDate`,
      );
      expect(sql).toContain(
        `(p."createdAt" AT TIME ZONE 'America/Santiago')::date <= :endDate`,
      );
      expect(qb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PAID',
          eventId: 'ev-1',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        }),
      );
    });

    it('pagina: page 2 limit 10 -> skip 10 take 10 y totalPages', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 25]);
      const res = await service.list({ page: 2, limit: 10 });
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(res.pagination).toEqual({
        page: 2,
        limit: 10,
        totalItems: 25,
        totalPages: 3,
      });
    });

    it('defaults page 1 limit 10 y orden createdAt DESC', async () => {
      await service.list({});
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(qb.orderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
    });

    it('devuelve totales numericos', async () => {
      qb.getRawOne.mockResolvedValue({
        totalPurchases: '5',
        paidPurchases: '3',
        paidAmount: '60000.00',
      });
      const res = await service.list({});
      expect(res.totals).toEqual({
        totalPurchases: 5,
        paidPurchases: 3,
        paidAmount: 60000,
      });
    });

    it('mapea pago manual: manualPaymentMethod y mpPaymentId null', async () => {
      qb.getManyAndCount.mockResolvedValue([
        [buildPurchase({ mpPaymentId: 'INTERNAL_EFECTIVO' })],
        1,
      ]);
      const res = await service.list({});
      expect(res.items[0].manualPaymentMethod).toBe('EFECTIVO');
      expect(res.items[0].mpPaymentId).toBeNull();
    });

    it('buyerDisplayName cae al primer asistente sin mpPayerName', async () => {
      eventRepo.find.mockResolvedValue([{ id: 'ev-1', title: 'Gala' }]);
      qb.getManyAndCount.mockResolvedValue([
        [buildPurchase({ mpPayerName: null })],
        1,
      ]);
      const res = await service.list({});
      expect(res.items[0].buyerDisplayName).toBe('Ana Perez');
      expect(res.items[0].eventTitle).toBe('Gala');
      expect(res.items[0].ticketsCount).toBe(1);
      expect(res.items[0].createdAt).toBe('2026-10-01T10:00:00.000Z');
    });
  });

  describe('getDetail', () => {
    it('lanza NotFound si no existe', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);
      await expect(service.getDetail('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('arma detalle con asistentes, tipo de ticket y otras compras', async () => {
      purchaseRepo.findOne.mockResolvedValue(buildPurchase());
      ticketTypeRepo.find.mockResolvedValue([{ id: 'tt-1', name: 'General' }]);
      qb.getMany.mockResolvedValue([
        buildPurchase({ id: 'p-2', status: EventPurchaseStatus.REJECTED }),
      ]);
      const d = await service.getDetail('p-1');
      expect(d.attendees).toEqual([
        {
          firstName: 'Ana',
          lastName: 'Perez',
          ticketTypeName: 'General',
          attendanceDate: '2026-11-01',
          sessionId: 's-1',
        },
      ]);
      expect(d.hasTicketsFile).toBe(true);
      expect(d.hasReceiptFile).toBe(false);
      expect(d.mpPayerId).toBe('payer-1');
      expect(d.paidAt).toBe('2026-10-01T12:00:00.000Z');
      expect(d.otherPurchases.map((o) => o.id)).toEqual(['p-2']);
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('p.id <> :id'),
      );
      expect(qb.setParameters).toHaveBeenCalledWith({
        id: 'p-1',
        email: 'ana@mail.cl',
        payerId: 'payer-1',
      });
    });

    it('con mpPayerId null pasa payerId null (no compara por pagador)', async () => {
      purchaseRepo.findOne.mockResolvedValue(
        buildPurchase({ mpPayerId: null }),
      );
      await service.getDetail('p-1');
      expect(qb.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({ payerId: null }),
      );
      const where = qb.where.mock.calls[0][0] as string;
      expect(where).toContain(':payerId IS NOT NULL');
      expect(where).toContain('lower(p."buyerEmail") = lower(:email)');
    });
  });

  describe('getFile', () => {
    it('ticketsFileKey null -> NotFound', async () => {
      purchaseRepo.findOne.mockResolvedValue(
        buildPurchase({ ticketsFileKey: null }),
      );
      await expect(service.getFile('p-1', 'tickets')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.getObject).not.toHaveBeenCalled();
    });

    it('compra inexistente -> NotFound', async () => {
      purchaseRepo.findOne.mockResolvedValue(null);
      await expect(service.getFile('p-1', 'receipt')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ENOENT -> NotFound', async () => {
      purchaseRepo.findOne.mockResolvedValue(buildPurchase());
      storage.getObject.mockRejectedValue(
        Object.assign(new Error('no'), { code: 'ENOENT' }),
      );
      await expect(service.getFile('p-1', 'tickets')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('clave fuera de UPLOADS_DIR -> NotFound', async () => {
      purchaseRepo.findOne.mockResolvedValue(buildPurchase());
      storage.getObject.mockRejectedValue(
        new Error('Ruta fuera de UPLOADS_DIR'),
      );
      await expect(service.getFile('p-1', 'tickets')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('otro error se propaga', async () => {
      purchaseRepo.findOne.mockResolvedValue(buildPurchase());
      storage.getObject.mockRejectedValue(new Error('EIO'));
      await expect(service.getFile('p-1', 'tickets')).rejects.toThrow('EIO');
    });

    it('devuelve buffer y nombre con mpPaymentId', async () => {
      purchaseRepo.findOne.mockResolvedValue(buildPurchase());
      storage.getObject.mockResolvedValue(Buffer.from('pdf'));
      const f = await service.getFile('p-1', 'tickets');
      expect(f.filename).toBe('123-tickets.pdf');
      expect(f.buffer.toString()).toBe('pdf');
    });

    it('nombre usa id si es pago manual', async () => {
      purchaseRepo.findOne.mockResolvedValue(
        buildPurchase({
          mpPaymentId: 'INTERNAL_EFECTIVO',
          receiptFileKey: 'ventas/r.pdf',
        }),
      );
      storage.getObject.mockResolvedValue(Buffer.from('pdf'));
      const f = await service.getFile('p-1', 'receipt');
      expect(f.filename).toBe('p-1-comprobante.pdf');
    });
  });
});
