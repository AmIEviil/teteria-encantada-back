import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
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
    });

    try {
      return await this.productRepository.save(product);
    } catch (error) {
      this.handleDatabaseError(error);
    }
  }

  findAll(): Promise<Product[]> {
    return this.productRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOneBy({ id });

    if (!product) {
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    }

    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(id);

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

    Object.assign(product, {
      ...updateProductDto,
      description: updateProductDto.description ?? product.description,
    });

    try {
      return await this.productRepository.save(product);
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
}
