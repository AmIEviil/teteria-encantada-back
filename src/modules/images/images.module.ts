import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Image } from './entities/image.entity';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { DiskStorageService } from './storage/disk-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Image])],
  controllers: [ImagesController],
  providers: [ImagesService, DiskStorageService],
  exports: [ImagesService, DiskStorageService],
})
export class ImagesModule {}
