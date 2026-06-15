import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

describe('CreateProductDto', () => {
  it('valida un payload correcto', async () => {
    const dto = plainToInstance(CreateProductDto, {
      code: 'P1',
      name: 'Producto',
      price: 10.5,
      minimumQuantity: 1,
      currentQuantity: 5,
      maximumQuantity: 10,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('falla con campos requeridos faltantes', async () => {
    const dto = plainToInstance(CreateProductDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('falla con precio negativo', async () => {
    const dto = plainToInstance(CreateProductDto, {
      code: 'P1',
      name: 'N',
      price: -1,
      minimumQuantity: 0,
      currentQuantity: 0,
      maximumQuantity: 0,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'price')).toBe(true);
  });
});

describe('UpdateProductDto', () => {
  it('acepta payload parcial', async () => {
    const dto = plainToInstance(UpdateProductDto, { name: 'Nuevo' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('acepta payload vacio', async () => {
    const dto = plainToInstance(UpdateProductDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('falla con tipo invalido', async () => {
    const dto = plainToInstance(UpdateProductDto, { isActive: 'no-bool' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'isActive')).toBe(true);
  });
});
