import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export interface MpChargeInput {
  amount: number;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payerEmail: string;
  description: string;
  externalReference: string;
}

export interface MpChargeResult {
  id: string;
  status: 'approved' | 'in_process' | 'pending' | 'rejected' | string;
  statusDetail: string;
}

@Injectable()
export class MercadoPagoService {
  private payment(): Payment {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    });
    return new Payment(client);
  }

  async charge(input: MpChargeInput): Promise<MpChargeResult> {
    const res = await this.payment().create({
      body: {
        transaction_amount: input.amount,
        token: input.token,
        description: input.description,
        installments: input.installments,
        payment_method_id: input.paymentMethodId,
        // MP's TS types declare issuer_id as number, but the API expects the
        // string issuer id returned by the payment methods endpoint.
        issuer_id: input.issuerId as unknown as number | undefined,
        payer: { email: input.payerEmail },
        external_reference: input.externalReference,
      },
    });
    return {
      id: String(res.id),
      status: res.status ?? 'unknown',
      statusDetail: res.status_detail ?? '',
    };
  }

  async getPayment(
    id: string,
  ): Promise<MpChargeResult & { externalReference: string | null }> {
    const res = await this.payment().get({ id });
    return {
      id: String(res.id),
      status: res.status ?? 'unknown',
      statusDetail: res.status_detail ?? '',
      externalReference: res.external_reference ?? null,
    };
  }
}
