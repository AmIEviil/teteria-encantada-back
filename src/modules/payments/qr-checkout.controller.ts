import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateQrCheckoutDto } from './dto/create-qr-checkout.dto';
import {
  PaymentsService,
  QrCheckoutResult,
  QrCheckoutStatusResult,
} from './payments.service';
import { EventPurchaseStatus } from '../events/entities/event-purchase.entity';

// Vive en PaymentsModule (no en EventsModule) porque depende de
// PaymentsService; EventsModule no lo tiene y meterlo ahí crearía un ciclo.
@Controller('events/:eventId/qr-checkout')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class QrCheckoutController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateQrCheckoutDto,
  ): Promise<QrCheckoutResult> {
    return this.paymentsService.createQrCheckout(eventId, dto);
  }

  @Get(':purchaseId')
  get(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ): Promise<QrCheckoutStatusResult> {
    return this.paymentsService.getQrCheckout(eventId, purchaseId);
  }

  @Post(':purchaseId/cancel')
  cancel(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ): Promise<{ status: EventPurchaseStatus }> {
    return this.paymentsService.cancelQrCheckout(eventId, purchaseId);
  }
}
