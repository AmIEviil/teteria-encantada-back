import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Image } from '../images/entities/image.entity';
import { ImagesService } from '../images/images.service';
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
    private readonly imagesService: ImagesService,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    this.validateInventoryRange(
      createProductDto.minimumQuantity,
      createProductDto.currentQuantity,
      createProductDto.maximumQuantity,
    );

    const product = this.productRepository.create({
      ...createProductDto,
      description: createProductDto.description ?? null,
      isActive: createProductDto.isActive ?? true,
      imageId: createProductDto.imageId ?? null,
    });

    try {
      const saved = await this.productRepository.save(product);
      return this.findOne(saved.id);
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

    return products.map((product) =>
      this.withResolvedImage(
        product,
        product.imageId ? (imageMap.get(product.imageId) ?? null) : null,
      ),
    );
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOneBy({ id });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    const image = await this.findImageById(product.imageId);

    const priceHistory = await this.productPriceHistoryRepository.find({
      where: { productId: product.id },
      relations: { user: true },
      order: { changedAt: 'DESC' },
    });

    product.priceHistory = priceHistory.map((entry) => ({
      id: entry.id,
      productId: entry.productId,
      changedBy: this.resolveChangedBy(entry),
      previousPrice: entry.previousPrice,
      newPrice: entry.newPrice,
      changedAt: entry.changedAt,
    }));

    return this.withResolvedImage(product, image?.url ?? null);
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

    const hasImageField = Object.hasOwn(updateProductDto, 'imageId');
    const previousImageId = product.imageId;
    const nextImageId = updateProductDto.imageId ?? null;

    const productPatch = {
      ...updateProductDto,
      description: updateProductDto.description ?? product.description,
    };

    const previousPrice = product.price;
    const nextPrice = updateProductDto.price;
    const hasPriceChanged =
      nextPrice !== undefined &&
      this.normalizePrice(previousPrice) !== this.normalizePrice(nextPrice);

    Object.assign(product, productPatch);

    if (hasImageField) {
      product.imageId = nextImageId;
    }

    try {
      const savedProduct = await this.productRepository.save(product);

      if (hasPriceChanged && nextPrice !== undefined) {
        const priceHistory = this.productPriceHistoryRepository.create({
          productId: savedProduct.id,
          userId: updatedByUserId,
          previousPrice: this.normalizePrice(previousPrice),
          newPrice: this.normalizePrice(nextPrice),
        });
        await this.productPriceHistoryRepository.save(priceHistory);
      }

      if (
        hasImageField &&
        previousImageId &&
        previousImageId !== nextImageId
      ) {
        await this.imagesService.remove(previousImageId);
      }

      return this.findOne(savedProduct.id);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const product = await this.productRepository.findOneBy({ id });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    const imageId = product.imageId;

    try {
      await this.productRepository.remove(product);
      if (imageId) {
        await this.imagesService.remove(imageId);
      }
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
    imageUrl: string | null,
  ): Product {
    product.imageUrl = imageUrl;
    return product;
  }

  private async findProductImageMap(
    imageIds: string[],
  ): Promise<Map<string, string>> {
    if (imageIds.length === 0) {
      return new Map<string, string>();
    }

    const images = await this.imageRepository.findBy({ id: In(imageIds) });

    return new Map(images.map((image) => [image.id, image.url] as const));
  }

  private async findImageById(imageId: string | null): Promise<Image | null> {
    if (!imageId) {
      return null;
    }
    return this.imageRepository.findOneBy({ id: imageId });
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
