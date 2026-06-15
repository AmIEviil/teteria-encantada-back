import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Client } from '@aws-sdk/client-s3';
import { Image } from './entities/image.entity';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { S3StorageService, S3_CLIENT } from './storage/s3-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Image])],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    S3StorageService,
    {
      provide: S3_CLIENT,
      useFactory: () =>
        new S3Client({
          region: process.env.AWS_REGION ?? 'us-east-1',
          credentials:
            process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
              : undefined,
        }),
    },
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
