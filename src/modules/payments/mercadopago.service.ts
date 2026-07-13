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
  // MP no dedupea reintentos por external_reference: sin idempotency key un
  // reintento (p.ej. por timeout de red) puede cobrar dos veces.
  idempotencyKey?: string;
}

export interface MpChargeResult {
  id: string;
  // MP puede devolver otros estados; los usados acá: approved | in_process | pending | rejected.
  status: string;
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
      requestOptions: input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
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
