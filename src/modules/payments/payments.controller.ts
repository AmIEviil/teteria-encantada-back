import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PayEventDto } from './dto/pay-event.dto';
import { PayEventResult, PaymentsService } from './payments.service';

interface MpWebhookBody {
  type?: string;
  action?: string;
  data?: { id?: string };
}

@Controller('public')
@Public()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('events/:id/pay')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayEventDto,
  ): Promise<PayEventResult> {
    return this.paymentsService.pay(id, dto);
  }

  @Post('mercadopago/webhook')
  async webhook(@Body() body: MpWebhookBody): Promise<{ received: true }> {
    const isPayment = body.type === 'payment' || body.action?.startsWith('payment');
    if (isPayment && body.data?.id) {
      await this.paymentsService.handleWebhook(String(body.data.id));
    }
    return { received: true };
  }
}
