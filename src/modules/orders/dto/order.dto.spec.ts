import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';
import { UpdateOrderDto } from './update-order.dto';
import { GetOrdersReportDto } from './get-orders-report.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Order DTOs', () => {
  it('CreateOrderDto valido', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      tableId: uuid,
      peopleCount: 2,
      items: [{ productId: uuid, quantity: 1 }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateOrderDto rechaza item con quantity 0', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [{ productId: uuid, quantity: 0 }],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateOrderDto valido', async () => {
    const dto = plainToInstance(UpdateOrderDto, { status: 'PAID' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateOrderDto rechaza status invalido', async () => {
    const dto = plainToInstance(UpdateOrderDto, { status: 'NOPE' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('GetOrdersReportDto valido', async () => {
    const dto = plainToInstance(GetOrdersReportDto, {
      page: 1,
      limit: 10,
      orderBy: 'total',
      orderDirection: 'ASC',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('GetOrdersReportDto rechaza limit > 100', async () => {
    const dto = plainToInstance(GetOrdersReportDto, { limit: 999 });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
