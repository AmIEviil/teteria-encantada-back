export interface SalePaymentInfo {
  mpPaymentId: string;
  status: string;
  approvedAt: Date | null;
  amount: number | null;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  installments: number | null;
  payerId: string | null;
  payerName: string | null;
  payerEmail: string | null;
}
