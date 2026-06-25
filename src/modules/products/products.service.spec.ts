import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';

type AnyRepo = Record<string, jest.Mock>;

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prod-1',
    code: 'P1',
    name: 'Producto',
    description: 'desc',
    price: 10,
    minimumQuantity: 1,
    currentQuantity: 5,
    maximumQuantity: 10,
    isActive: true,
    imageId: null,
    ...overrides,
  }) as Product;

const makeQueryFailed = (code: string): QueryFailedError => {
  const err = new QueryFailedError('q', [], new Error('x'));
  (err as unknown as { driverError: { code: string } }).driverError = { code };
  return err;
};

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: AnyRepo;
  let imageRepo: AnyRepo;
  let historyRepo: AnyRepo;
  let imagesService: { remove: jest.Mock; findOne: jest.Mock };

  beforeEach(() => {
    productRepo = {
      create: jest.fn((v) => v),
      find: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    imageRepo = {
      findBy: jest.fn(),
      findOneBy: jest.fn(),
    };
    historyRepo = {
      create: jest.fn((v) => v),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    imagesService = {
      remove: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };

    service = new ProductsService(
      productRepo as never,
      imageRepo as never,
      historyRepo as never,
      imagesService as never,
    );
  });

  describe('create', () => {
    it('lanza BadRequest si min > max', async () => {
      const dto = {
        code: 'P1',
        name: 'N',
        price: 10,
        minimumQuantity: 20,
        currentQuantity: 5,
        maximumQuantity: 10,
      } as never;
      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lanza BadRequest si current < min', async () => {
      const dto = {
        code: 'P1',
        name: 'N',
        price: 10,
        minimumQuantity: 5,
        currentQuantity: 1,
        maximumQuantity: 10,
      } as never;
      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lanza BadRequest si current > max', async () => {
      const dto = {
        code: 'P1',
        name: 'N',
        price: 10,
        minimumQuantity: 1,
        currentQuantity: 50,
        maximumQuantity: 10,
      } as never;
      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('crea producto sin imagen', async () => {
      const dto = {
        code: 'P1',
        name: 'N',
        price: 10,
        minimumQuantity: 1,
        currentQuantity: 5,
        maximumQuantity: 10,
      } as never;
      productRepo.save.mockResolvedValue({ id: 'prod-1', imageId: null });
      productRepo.findOneBy.mockResolvedValue(
        buildProduct({ id: 'prod-1', imageId: null }),
      );
      const result = await service.create(dto);
      expect(result.imageUrl).toBeNull();
      expect(productRepo.save).toHaveBeenCalledTimes(1);
    });

    it('traduce error 23505 a Conflict', async () => {
      productRepo.save.mockRejectedValueOnce(makeQueryFailed('23505'));
      const dto = {
        code: 'P1',
        name: 'N',
        price: 10,
        minimumQuantity: 1,
        currentQuantity: 5,
        maximumQuantity: 10,
      } as never;
      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('resuelve imageUrl de productos', async () => {
      productRepo.find.mockResolvedValue([
        buildProduct({ id: 'a', imageId: 'img-1' }),
        buildProduct({ id: 'b', imageId: null }),
      ]);
      imageRepo.findBy.mockResolvedValue([
        { id: 'img-1', url: 'https://cdn/x.png' },
      ]);
      const result = await service.findAll();
      expect(result[0].imageUrl).toBe('https://cdn/x.png');
      expect(result[1].imageUrl).toBeNull();
    });

    it('no consulta imagenes si no hay imageIds', async () => {
      productRepo.find.mockResolvedValue([buildProduct({ imageId: null })]);
      const result = await service.findAll();
      expect(imageRepo.findBy).not.toHaveBeenCalled();
      expect(result[0].imageUrl).toBeNull();
    });
  });

  describe('findOne', () => {
    it('lanza NotFound si no existe', async () => {
      productRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('devuelve producto con historial y resuelve changedBy username', async () => {
      productRepo.findOneBy.mockResolvedValue(
        buildProduct({ imageId: 'img-1' }),
      );
      imageRepo.findOneBy.mockResolvedValue({
        id: 'img-1',
        url: 'https://cdn/x.png',
      });
      historyRepo.find.mockResolvedValue([
        {
          id: 'h1',
          productId: 'prod-1',
          previousPrice: 5,
          newPrice: 8,
          changedAt: new Date(),
          user: { username: 'juan' },
        },
      ]);
      const result = await service.findOne('prod-1');
      expect(result.imageUrl).toBe('https://cdn/x.png');
      expect(result.priceHistory?.[0].changedBy).toBe('juan');
    });

    it('resuelve changedBy con nombre completo', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      historyRepo.find.mockResolvedValue([
        {
          id: 'h1',
          productId: 'prod-1',
          previousPrice: 5,
          newPrice: 8,
          changedAt: new Date(),
          user: { first_name: 'Ana', last_name: 'Paz', username: '  ' },
        },
      ]);
      const result = await service.findOne('prod-1');
      expect(result.priceHistory?.[0].changedBy).toBe('Ana Paz');
    });

    it('resuelve changedBy con email cuando no hay nombre', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      historyRepo.find.mockResolvedValue([
        {
          id: 'h1',
          productId: 'prod-1',
          previousPrice: 5,
          newPrice: 8,
          changedAt: new Date(),
          user: { email: 'a@b.com' },
        },
      ]);
      const result = await service.findOne('prod-1');
      expect(result.priceHistory?.[0].changedBy).toBe('a@b.com');
    });

    it('usa "Usuario" cuando falta todo dato del user', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      historyRepo.find.mockResolvedValue([
        {
          id: 'h1',
          productId: 'prod-1',
          previousPrice: 5,
          newPrice: 8,
          changedAt: new Date(),
          user: {},
        },
      ]);
      const result = await service.findOne('prod-1');
      expect(result.priceHistory?.[0].changedBy).toBe('Usuario');
    });
  });

  describe('update', () => {
    it('lanza NotFound si no existe', async () => {
      productRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('x', {} as never, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualiza precio y registra historial', async () => {
      productRepo.findOneBy
        .mockResolvedValueOnce(buildProduct({ price: 10 }))
        .mockResolvedValueOnce(buildProduct({ price: 20, imageId: null }));
      const result = await service.update(
        'prod-1',
        { price: 20 } as never,
        'u1',
      );
      expect(historyRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('prod-1');
    });

    it('llama imagesService.remove cuando imageId cambia', async () => {
      productRepo.findOneBy
        .mockResolvedValueOnce(buildProduct({ imageId: 'img-old' }))
        .mockResolvedValueOnce(buildProduct({ imageId: 'img-new' }));
      await service.update('prod-1', { imageId: 'img-new' } as never, 'u1');
      expect(imagesService.remove).toHaveBeenCalledWith('img-old');
    });

    it('llama imagesService.remove con null cuando imageId se limpia', async () => {
      productRepo.findOneBy
        .mockResolvedValueOnce(buildProduct({ imageId: 'img-old' }))
        .mockResolvedValueOnce(buildProduct({ imageId: null }));
      await service.update('prod-1', { imageId: null } as never, 'u1');
      expect(imagesService.remove).toHaveBeenCalledWith('img-old');
    });

    it('no llama imagesService.remove cuando no se envia campo imageId', async () => {
      productRepo.findOneBy
        .mockResolvedValueOnce(buildProduct({ imageId: 'img-1' }))
        .mockResolvedValueOnce(buildProduct({ imageId: 'img-1' }));
      await service.update('prod-1', { name: 'X' } as never, 'u1');
      expect(imagesService.remove).not.toHaveBeenCalled();
    });

    it('traduce error db en update', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      productRepo.save.mockRejectedValueOnce(makeQueryFailed('23505'));
      await expect(
        service.update('prod-1', { name: 'X' } as never, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('elimina producto', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      const result = await service.remove('prod-1');
      expect(result.message).toContain('eliminado');
    });

    it('llama imagesService.remove si habia imagen', async () => {
      productRepo.findOneBy.mockResolvedValue(
        buildProduct({ imageId: 'img-1' }),
      );
      await service.remove('prod-1');
      expect(imagesService.remove).toHaveBeenCalledWith('img-1');
    });

    it('traduce FK 23503 a Conflict', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      productRepo.remove.mockRejectedValueOnce(makeQueryFailed('23503'));
      await expect(service.remove('prod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('relanza error desconocido', async () => {
      productRepo.findOneBy.mockResolvedValue(buildProduct());
      const other = new Error('boom');
      productRepo.remove.mockRejectedValueOnce(other);
      await expect(service.remove('prod-1')).rejects.toBe(other);
    });
  });
});

describe('ProductsService imágenes', () => {
  const productRepository: any = {};
  const imageRepository: any = {};
  const priceHistoryRepository: any = {};
  const imagesService: any = { remove: jest.fn(), findOne: jest.fn() };

  const buildService = () =>
    new ProductsService(
      productRepository,
      imageRepository,
      priceHistoryRepository,
      imagesService,
    );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('findOne resuelve imageUrl desde la imagen referenciada', async () => {
    productRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ id: 'p1', imageId: 'img-1' });
    imageRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ id: 'img-1', url: 'https://cdn/x.png' });
    priceHistoryRepository.find = jest.fn().mockResolvedValue([]);

    const service = buildService();
    const product = await service.findOne('p1');

    expect(product.imageUrl).toBe('https://cdn/x.png');
  });

  it('findOne deja imageUrl en null cuando no hay imagen', async () => {
    productRepository.findOneBy = jest
      .fn()
      .mockResolvedValue({ id: 'p1', imageId: null });
    priceHistoryRepository.find = jest.fn().mockResolvedValue([]);

    const service = buildService();
    const product = await service.findOne('p1');

    expect(product.imageUrl).toBeNull();
  });
});
