import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { SalePaymentInfo } from '../sales-archive/sales-archive.types';

// Líneas que MP muestra como detalle del pago en el panel del comercio
// (additional_info.items). La suma de quantity * unitPrice debe dar el monto
// cobrado.
export interface MpItem {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  description?: string;
}

export interface MpChargeInput {
  amount: number;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payerEmail: string;
  description: string;
  items?: MpItem[];
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

export interface MpPaymentResult extends MpChargeResult {
  externalReference: string | null;
  // Datos del pago y del pagador para el archivo de ventas.
  details: SalePaymentInfo;
}

export interface MpPreferenceInput {
  items: MpItem[];
  payerEmail: string;
  externalReference: string;
  expiresAt: Date;
}

export interface MpPreferenceResult {
  id: string;
  // URL de pago de Checkout Pro; es lo que se codifica en el QR.
  initPoint: string;
}

@Injectable()
export class MercadoPagoService {
  private payment(): Payment {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    });
    return new Payment(client);
  }

  private preference(): Preference {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    });
    return new Preference(client);
  }

  // MP exige ISO 8601 con offset numérico en las fechas de expiración y
  // rechaza el sufijo 'Z' que produce toISOString().
  private toMpDate(date: Date): string {
    return date.toISOString().replace('Z', '-00:00');
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
        additional_info: input.items?.length
          ? {
              items: input.items.map((i) => ({
                id: i.id,
                title: i.title,
                quantity: i.quantity,
                unit_price: i.unitPrice,
                description: i.description,
              })),
            }
          : undefined,
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

  async getPayment(id: string): Promise<MpPaymentResult> {
    const res = await this.payment().get({ id });
    const status = res.status ?? 'unknown';
    const payer = res.payer;
    const payerName =
      [payer?.first_name, payer?.last_name]
        .map((part) => part?.trim() ?? '')
        .filter((part) => part.length > 0)
        .join(' ') || null;
    return {
      id: String(res.id),
      status,
      statusDetail: res.status_detail ?? '',
      externalReference: res.external_reference ?? null,
      details: {
        mpPaymentId: String(res.id),
        status,
        approvedAt: res.date_approved ? new Date(res.date_approved) : null,
        amount: res.transaction_amount ?? null,
        paymentMethodId: res.payment_method_id ?? null,
        paymentTypeId: res.payment_type_id ?? null,
        installments: res.installments ?? null,
        // MP declara payer.id como string pero a veces lo entrega numérico.
        payerId:
          payer?.id !== undefined && payer?.id !== null
            ? String(payer.id)
            : null,
        payerName,
        payerEmail: payer?.email ?? null,
      },
    };
  }

  async createPreference(
    input: MpPreferenceInput,
  ): Promise<MpPreferenceResult> {
    const resultUrl = `${process.env.FRONTEND_URL ?? ''}/publico/pago/resultado`;
    const res = await this.preference().create({
      body: {
        items: input.items.map((i) => ({
          id: i.id,
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          description: i.description,
          currency_id: 'CLP',
        })),
        payer: { email: input.payerEmail },
        external_reference: input.externalReference,
        notification_url: `${process.env.PUBLIC_API_URL ?? ''}/public/mercadopago/webhook`,
        back_urls: {
          success: resultUrl,
          pending: resultUrl,
          failure: resultUrl,
        },
        // MP rechaza la preferencia completa si auto_return apunta a una URL
        // que no puede alcanzar (típico en desarrollo con localhost).
        auto_return: resultUrl.startsWith('https://') ? 'approved' : undefined,
        // Sin estados intermedios: en cobro presencial un 'in_process' deja al
        // operador sin saber si entregar o no.
        binary_mode: true,
        expires: true,
        expiration_date_from: this.toMpDate(new Date()),
        expiration_date_to: this.toMpDate(input.expiresAt),
      },
    });
    return {
      id: String(res.id),
      initPoint: res.init_point ?? '',
    };
  }
}
