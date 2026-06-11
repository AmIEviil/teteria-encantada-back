import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

// SkipThrottle: hay un ThrottlerGuard global (limit 5 / 15 min) que
// estrangularía los webhooks de Meta. El webhook debe quedar exento.
@SkipThrottle()
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly webhookService: WhatsappWebhookService) {}

  // Verificación del webhook que exige Meta al registrarlo.
  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === 'subscribe' && token && token === expected) {
      return challenge;
    }
    throw new BadRequestException('Verificación de webhook inválida');
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(@Body() body: unknown): Promise<{ received: true }> {
    await this.webhookService.handleIncoming(body);
    return { received: true };
  }
}
