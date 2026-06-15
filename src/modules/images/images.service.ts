import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Image } from './entities/image.entity';
import { S3StorageService } from './storage/s3-storage.service';

export interface UploadableFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class ImagesService {
  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    private readonly storage: S3StorageService,
  ) {}

  async upload(file: UploadableFile): Promise<Image> {
    const extension = extname(file.originalname) || '.bin';
    const key = `images/${randomUUID()}${extension.toLowerCase()}`;

    await this.storage.putObject(key, file.buffer, file.mimetype);

    const image = this.imageRepository.create({
      key,
      url: this.storage.publicUrl(key),
      mimeType: file.mimetype,
      size: file.size,
    });

    return this.imageRepository.save(image);
  }

  async findOne(id: string): Promise<Image | null> {
    return this.imageRepository.findOneBy({ id });
  }

  async remove(id: string | null): Promise<void> {
    if (!id) {
      return;
    }
    const image = await this.imageRepository.findOneBy({ id });
    if (!image) {
      return;
    }
    await this.storage.deleteObject(image.key);
    await this.imageRepository.delete(id);
  }
}
