import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { BUSINESS_TIMEZONE } from '../../common/date/santiago-date';
import type { PdfTicketInput } from '../tickets-pdf/tickets-pdf.service';
import { SalePaymentInfo } from './sales-archive.types';

export interface ReceiptInput {
  purchaseId: string;
  buyerEmail: string;
  eventTitle: string;
  payment: SalePaymentInfo;
  tickets: PdfTicketInput[];
}

const PAGE_W = 595; // A4 retrato
const PAGE_H = 842;
const MARGIN = 48;
const NOT_INFORMED = 'No informado';

// Mismo criterio que TicketsPdfService: Helvetica solo codifica WinAnsi y un
// emoji haría lanzar a pdf-lib, abortando el comprobante entero.
const sanitize = (text: string, font: PDFFont): string =>
  Array.from(text)
    .filter((ch) => {
      try {
        font.encodeText(ch);
        return true;
      } catch {
        return false;
      }
    })
    .join('');

const formatApprovedAt = (date: Date | null): string => {
  if (!date) return NOT_INFORMED;
  const parts = new Intl.DateTimeFormat('es-CL', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
};

const formatClp = (amount: number | null): string =>
  amount == null
    ? NOT_INFORMED
    : `$${Math.round(amount)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const orNotInformed = (value: string | number | null | undefined): string =>
  value == null || value === '' ? NOT_INFORMED : String(value);

const formatDateTime = (date: string, time: string | null): string => {
  const [y, m, d] = date.split('-');
  const dmy = y && m && d ? `${d}-${m}-${y}` : date;
  return time ? `${dmy} ${time}` : dmy;
};

export async function buildReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const text = (
    value: string,
    x: number,
    size: number,
    f: PDFFont,
    maxWidth?: number,
  ) => {
    let safe = sanitize(value, f);
    if (maxWidth) {
      while (safe.length > 1 && f.widthOfTextAtSize(safe, size) > maxWidth) {
        safe = safe.slice(0, -1);
      }
    }
    page.drawText(safe, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  };

  text("Experiencias D'encanto", MARGIN, 16, bold);
  y -= 26;
  text('Comprobante de pago', MARGIN, 22, bold);
  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 24;

  const { payment } = input;
  const rows: Array<[string, string]> = [
    ['N° de pago Mercado Pago', orNotInformed(payment.mpPaymentId)],
    ['Id de compra', orNotInformed(input.purchaseId)],
    ['Fecha de aprobación', formatApprovedAt(payment.approvedAt)],
    ['Estado', orNotInformed(payment.status)],
    ['Medio de pago', orNotInformed(payment.paymentMethodId)],
    ['Cuotas', orNotInformed(payment.installments)],
    ['Monto total', formatClp(payment.amount)],
    ['Email comprador', orNotInformed(input.buyerEmail)],
    ['Id pagador MP', orNotInformed(payment.payerId)],
    ['Nombre pagador MP', orNotInformed(payment.payerName)],
  ];

  const valueX = MARGIN + 190;
  for (const [label, value] of rows) {
    ensureSpace(22);
    text(label, MARGIN, 11, bold);
    text(value, valueX, 11, font, PAGE_W - MARGIN - valueX);
    y -= 20;
  }

  y -= 10;
  ensureSpace(30);
  text('Detalle de tickets', MARGIN, 14, bold);
  y -= 22;

  for (const t of input.tickets) {
    ensureSpace(48);
    text(
      `${orNotInformed(t.attendeeName)} - ${orNotInformed(t.ticketTypeName)}`,
      MARGIN,
      11,
      bold,
      PAGE_W - MARGIN * 2,
    );
    y -= 15;
    text(
      `${input.eventTitle} | ${formatDateTime(t.attendanceDate, t.sessionTime)} | ${formatClp(t.price ?? null)}`,
      MARGIN,
      10,
      font,
      PAGE_W - MARGIN * 2,
    );
    y -= 20;
  }

  return Buffer.from(await doc.save());
}
