import { StreamableFile } from '@nestjs/common';
import { EventPurchasesController } from './event-purchases.controller';
import { EventPurchasesService } from './event-purchases.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';

describe('EventPurchasesController', () => {
  const service = {
    list: jest.fn(),
    getDetail: jest.fn(),
    getFile: jest.fn(),
  };
  const controller = new EventPurchasesController(
    service as unknown as EventPurchasesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('roles son [SUPERADMIN, ADMIN]', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EventPurchasesController)).toEqual([
      SYSTEM_ROLES.SUPERADMIN,
      SYSTEM_ROLES.ADMIN,
    ]);
  });

  it('list delega', async () => {
    service.list.mockResolvedValue({ items: [] });
    await expect(controller.list({ page: 2 })).resolves.toEqual({ items: [] });
    expect(service.list).toHaveBeenCalledWith({ page: 2 });
  });

  it('detail delega', async () => {
    service.getDetail.mockResolvedValue({ id: 'a' });
    await expect(controller.detail('a')).resolves.toEqual({ id: 'a' });
    expect(service.getDetail).toHaveBeenCalledWith('a');
  });

  it('tickets.pdf devuelve StreamableFile attachment', async () => {
    service.getFile.mockResolvedValue({
      buffer: Buffer.from('x'),
      filename: '123-tickets.pdf',
    });
    const f = await controller.tickets('a');
    expect(service.getFile).toHaveBeenCalledWith('a', 'tickets');
    expect(f).toBeInstanceOf(StreamableFile);
    expect(f.getHeaders().type).toBe('application/pdf');
    expect(f.getHeaders().disposition).toBe(
      'attachment; filename="123-tickets.pdf"',
    );
  });

  it('comprobante.pdf devuelve StreamableFile con filename', async () => {
    service.getFile.mockResolvedValue({
      buffer: Buffer.from('x'),
      filename: '123-comprobante.pdf',
    });
    const f = await controller.receipt('a');
    expect(service.getFile).toHaveBeenCalledWith('a', 'receipt');
    expect(f.getHeaders().disposition).toBe(
      'attachment; filename="123-comprobante.pdf"',
    );
  });
});
