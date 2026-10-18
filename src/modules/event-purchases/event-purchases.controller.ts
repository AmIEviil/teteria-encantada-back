import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetEventPurchasesDto } from './dto/get-event-purchases.dto';
import {
  EventPurchaseDetail,
  EventPurchasesListResponse,
} from './dto/event-purchases-response.dto';
import {
  EventPurchaseFileKind,
  EventPurchasesService,
} from './event-purchases.service';

@Controller('event-purchases')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
export class EventPurchasesController {
  constructor(private readonly service: EventPurchasesService) {}

  @Get()
  list(
    @Query() filters: GetEventPurchasesDto,
  ): Promise<EventPurchasesListResponse> {
    return this.service.list(filters);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<EventPurchaseDetail> {
    return this.service.getDetail(id);
  }

  @Get(':id/tickets.pdf')
  tickets(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.download(id, 'tickets');
  }

  @Get(':id/comprobante.pdf')
  receipt(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.download(id, 'receipt');
  }

  private async download(
    id: string,
    kind: EventPurchaseFileKind,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.service.getFile(id, kind);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
