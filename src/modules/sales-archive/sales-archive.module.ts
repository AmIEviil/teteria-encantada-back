import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPurchase } from '../events/entities/event-purchase.entity';
import { ImagesModule } from '../images/images.module';
import { SalesArchiveService } from './sales-archive.service';

@Module({
  imports: [TypeOrmModule.forFeature([EventPurchase]), ImagesModule],
  providers: [SalesArchiveService],
  exports: [SalesArchiveService],
})
export class SalesArchiveModule {}
