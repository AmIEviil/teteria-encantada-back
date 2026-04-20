import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Image } from '../images/entities/image.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductPriceHistory } from './entities/product-price-history.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectRepository(ProductPriceHistory)
    private readonly productPriceHistoryRepository: Repository<ProductPriceHistory>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    this.validateInventoryRange(
      createProductDto.minimumQuantity,
      createProductDto.currentQuantity,
      createProductDto.maximumQuantity,
    );

    const normalizedImageBase64 = this.normalizeImageBase64(
      createProductDto.imageBase64,
    );

    const productPayload = {
      ...createProductDto,
      description: createProductDto.description ?? null,
      isActive: createProductDto.isActive ?? true,
      imageId: null,
    };

    delete productPayload.imageBase64;

    const product = this.productRepository.create(productPayload);

    try {
      return await this.productRepository.manager.transaction(
        async (manager) => {
          const imageRepo = manager.getRepository(Image);
          const savedProduct = await manager
            .getRepository(Product)
            .save(product);

          if (normalizedImageBase64) {
            const image = await this.createImage(
              imageRepo,
              normalizedImageBase64,
            );
            savedProduct.imageId = image.id;
            await manager.getRepository(Product).save(savedProduct);
          }

          savedProduct.imageBase64 = normalizedImageBase64;

          return savedProduct;
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async findAll(): Promise<Product[]> {
    const products = await this.productRepository.find({
      order: { createdAt: 'DESC' },
    });

    const imageMap = await this.findProductImageMap(
      products
        .map((product) => product.imageId)
        .filter((imageId): imageId is string => imageId !== null),
    );

    return products.map((product) => {
      return this.withResolvedImage(
        product,
        product.imageId ? (imageMap.get(product.imageId) ?? null) : null,
      );
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOneBy({ id });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    const image = await this.findImageById(product.imageId);

    const priceHistory = await this.productPriceHistoryRepository.find({
      where: { productId: product.id },
      relations: {
        user: true,
      },
      order: { changedAt: 'DESC' },
    });

    product.priceHistory = priceHistory.map((entry) => {
      return {
        id: entry.id,
        productId: entry.productId,
        changedBy: this.resolveChangedBy(entry),
        previousPrice: entry.previousPrice,
        newPrice: entry.newPrice,
        changedAt: entry.changedAt,
      };
    });

    return this.withResolvedImage(product, image?.imageBase64 ?? null);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    updatedByUserId: string,
  ): Promise<Product> {
    const product = await this.productRepository.findOneBy({ id });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    const minimumQuantity =
      updateProductDto.minimumQuantity ?? product.minimumQuantity;
    const currentQuantity =
      updateProductDto.currentQuantity ?? product.currentQuantity;
    const maximumQuantity =
      updateProductDto.maximumQuantity ?? product.maximumQuantity;

    this.validateInventoryRange(
      minimumQuantity,
      currentQuantity,
      maximumQuantity,
    );

    const hasImageBase64Field = Object.hasOwn(updateProductDto, 'imageBase64');

    const existingImage = await this.findImageById(product.imageId);

    const normalizedImageBase64 = hasImageBase64Field
      ? this.normalizeImageBase64(updateProductDto.imageBase64)
      : undefined;

    const productPatch = {
      ...updateProductDto,
      description: updateProductDto.description ?? product.description,
    };

    delete productPatch.imageBase64;

    const previousPrice = product.price;
    const nextPrice = updateProductDto.price;
    const hasPriceChanged =
      nextPrice !== undefined &&
      this.normalizePrice(previousPrice) !== this.normalizePrice(nextPrice);

    Object.assign(product, productPatch);

    try {
      return await this.productRepository.manager.transaction(
        async (manager) => {
          const imageRepo = manager.getRepository(Image);
          const savedProduct = await manager
            .getRepository(Product)
            .save(product);

          if (hasImageBase64Field) {
            if (!normalizedImageBase64) {
              await this.deleteImageIfExists(imageRepo, savedProduct.imageId);
              savedProduct.imageId = null;
            } else if (savedProduct.imageId) {
              await this.updateImage(
                imageRepo,
                savedProduct.imageId,
                normalizedImageBase64,
              );
            } else {
              const image = await this.createImage(
                imageRepo,
                normalizedImageBase64,
              );
              savedProduct.imageId = image.id;
            }

            await manager.getRepository(Product).save(savedProduct);
          }

          if (hasPriceChanged && nextPrice !== undefined) {
            const historyRepo = manager.getRepository(ProductPriceHistory);
            const priceHistory = historyRepo.create({
              productId: savedProduct.id,
              userId: updatedByUserId,
              previousPrice: this.normalizePrice(previousPrice),
              newPrice: this.normalizePrice(nextPrice),
            });

            await historyRepo.save(priceHistory);
          }

          savedProduct.imageBase64 = hasImageBase64Field
            ? (normalizedImageBase64 ?? null)
            : (existingImage?.imageBase64 ?? null);

          return savedProduct;
        },
      );
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const product = await this.findOne(id);

    try {
      await this.productRepository.remove(product);
      return { message: 'Producto eliminado correctamente' };
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  private handleDatabaseError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string };

      if (driverError?.code === '23505') {
        throw new ConflictException('Ya existe un producto con ese codigo');
      }

      if (driverError?.code === '23503') {
        throw new ConflictException(
          'No se puede eliminar este producto porque esta asociado a ordenes',
        );
      }
    }

    throw error;
  }

  private validateInventoryRange(
    minimumQuantity: number,
    currentQuantity: number,
    maximumQuantity: number,
  ): void {
    if (minimumQuantity > maximumQuantity) {
      throw new BadRequestException(
        'La cantidad minima no puede ser mayor que la cantidad maxima',
      );
    }

    if (currentQuantity < minimumQuantity) {
      throw new BadRequestException(
        'La cantidad actual no puede ser menor que la cantidad minima',
      );
    }

    if (currentQuantity > maximumQuantity) {
      throw new BadRequestException(
        'La cantidad actual no puede ser mayor que la cantidad maxima',
      );
    }
  }

  private normalizePrice(value: number): number {
    return Number(value.toFixed(2));
  }

  private withResolvedImage(
    product: Product,
    imageBase64: string | null,
  ): Product {
    product.imageBase64 = imageBase64;
    return product;
  }

  private async findProductImageMap(
    imageIds: string[],
  ): Promise<Map<string, string>> {
    if (imageIds.length === 0) {
      return new Map<string, string>();
    }

    const images = await this.imageRepository.findBy({
      id: In(imageIds),
    });

    return new Map(
      images.map((image) => {
        return [image.id, image.imageBase64] as const;
      }),
    );
  }

  private async findImageById(imageId: string | null): Promise<Image | null> {
    if (!imageId) {
      return null;
    }

    return this.imageRepository.findOneBy({ id: imageId });
  }

  private async createImage(
    imageRepo: Repository<Image>,
    imageBase64: string,
  ): Promise<Image> {
    const image = imageRepo.create({ imageBase64 });
    return imageRepo.save(image);
  }

  private async updateImage(
    imageRepo: Repository<Image>,
    imageId: string,
    imageBase64: string,
  ): Promise<void> {
    await imageRepo.update(imageId, { imageBase64 });
  }

  private async deleteImageIfExists(
    imageRepo: Repository<Image>,
    imageId: string | null,
  ): Promise<void> {
    if (!imageId) {
      return;
    }

    await imageRepo.delete(imageId);
  }

  private normalizeImageBase64(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    return normalized;
  }

  private resolveChangedBy(entry: ProductPriceHistory): string {
    const username = entry.user?.username?.trim();
    if (username) {
      return username;
    }

    const firstName = entry.user?.first_name?.trim() ?? '';
    const lastName = entry.user?.last_name?.trim() ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    if (fullName) {
      return fullName;
    }

    return entry.user?.email ?? 'Usuario';
  }
}
