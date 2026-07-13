import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { TicketsPdfService } from './tickets-pdf.service';

@Module({
  imports: [ImagesModule],
  providers: [TicketsPdfService],
  exports: [TicketsPdfService],
})
export class TicketsPdfModule {}
