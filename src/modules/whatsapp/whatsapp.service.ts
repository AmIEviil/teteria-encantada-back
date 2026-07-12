import { Injectable, Logger } from '@nestjs/common';

const GRAPH_API_VERSION = 'v20.0';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  async sendReminderTemplate(phone: string, holderName: string): Promise<void> {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const templateName =
      process.env.WHATSAPP_TEMPLATE_NAME ?? 'reserva_recordatorio';

    if (!token || !phoneNumberId) {
      this.logger.warn(
        'WhatsApp no configurado (faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID); se omite el envío.',
      );
      return;
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: holderName }],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Error enviando plantilla WhatsApp (${response.status}): ${detail}`,
      );
    }
  }
}
