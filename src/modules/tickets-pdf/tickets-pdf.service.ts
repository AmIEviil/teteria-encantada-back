import { Injectable, Logger } from '@nestjs/common';
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { S3StorageService } from '../images/storage/s3-storage.service';

export interface PdfTicketInput {
  eventTitle: string;
  ticketTypeName: string;
  attendeeName: string;
  attendanceDate: string;
  sessionTime: string | null;
  menuSummary?: string | null;
  ticketNumber?: string | null;
  customTemplateUrl: string | null;
}

// Ancla de un campo sobre la plantilla, en fracciones del tamaño de la página
// (x/y desde la esquina superior izquierda, size y maxWidth como fracción del
// alto/ancho). Relativo y no absoluto para que la misma calibración sirva sea
// cual sea la resolución del PNG que suba la administradora.
interface FieldAnchor {
  x: number;
  y: number;
  size: number;
  maxWidth?: number;
  align?: 'left' | 'center';
}

export interface TicketTemplateLayout {
  attendeeName: FieldAnchor;
  dateTime: FieldAnchor;
  menu: FieldAnchor;
  ticketNumber: FieldAnchor;
  color: [number, number, number];
}

// ponytail: perillas de calibración. Medidas sobre CoralineJunio.png
// (1712x961), donde las etiquetas "Nombre:", "Día y Hora:", "Menú:" y
// "Ticket nro:" ya vienen impresas en la plantilla: aquí sólo van los valores,
// a la derecha (o debajo, en el caso del número) de cada etiqueta. Si una
// plantilla futura mueve las etiquetas, se ajustan estos números; si llegan a
// divergir de verdad entre eventos, esto pasa a ser una columna jsonb en
// event_ticket_types y se pasa por PdfTicketInput.
export const DEFAULT_TEMPLATE_LAYOUT: TicketTemplateLayout = {
  attendeeName: { x: 0.34, y: 0.63, size: 0.04, maxWidth: 0.4 },
  dateTime: { x: 0.34, y: 0.705, size: 0.04, maxWidth: 0.4 },
  menu: { x: 0.34, y: 0.782, size: 0.032, maxWidth: 0.42 },
  ticketNumber: { x: 0.858, y: 0.815, size: 0.038, align: 'center' },
  color: [1, 1, 1], // texto blanco: las plantillas son fotos oscuras
};

const TEMPLATE_PAGE_WIDTH = 842; // el alto sale del ratio real de la imagen
const FALLBACK_PAGE_W = 842; // A4 apaisado, sin plantilla
const FALLBACK_PAGE_H = 595;
const MARGIN = 48;

@Injectable()
export class TicketsPdfService {
  private readonly logger = new Logger(TicketsPdfService.name);

  constructor(private readonly storage: S3StorageService) {}

  async buildTicketsPdf(tickets: PdfTicketInput[]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    for (const t of tickets) {
      const template = await this.embedTemplate(doc, t.customTemplateUrl);

      if (!template) {
        this.drawFallback(doc, t, font, bold);
        continue;
      }

      const height = (TEMPLATE_PAGE_WIDTH * template.height) / template.width;
      const page = doc.addPage([TEMPLATE_PAGE_WIDTH, height]);
      page.drawImage(template, {
        x: 0,
        y: 0,
        width: TEMPLATE_PAGE_WIDTH,
        height,
      });
      this.drawFields(page, t, bold, DEFAULT_TEMPLATE_LAYOUT);
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  private drawFields(
    page: PDFPage,
    t: PdfTicketInput,
    font: PDFFont,
    layout: TicketTemplateLayout,
  ): void {
    const values: Array<[FieldAnchor, string | null | undefined]> = [
      [layout.attendeeName, t.attendeeName],
      [layout.dateTime, this.formatDateTime(t.attendanceDate, t.sessionTime)],
      [layout.menu, t.menuSummary],
      [layout.ticketNumber, t.ticketNumber],
    ];

    for (const [anchor, value] of values) {
      if (!value) continue;
      this.drawAnchored(page, value, anchor, font, layout.color);
    }
  }

  private drawAnchored(
    page: PDFPage,
    text: string,
    anchor: FieldAnchor,
    font: PDFFont,
    color: [number, number, number],
  ): void {
    const { width: W, height: H } = page.getSize();
    const size = anchor.size * H;
    const maxWidth = (anchor.maxWidth ?? 1) * W;
    const lines = this.wrap(this.sanitizeForFont(text, font), font, size, maxWidth);

    let y = H - anchor.y * H;
    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x =
        anchor.align === 'center'
          ? anchor.x * W - lineWidth / 2
          : anchor.x * W;
      page.drawText(line, {
        x,
        y,
        size,
        font,
        color: rgb(color[0], color[1], color[2]),
      });
      y -= size * 1.2;
    }
  }

  // "2026-07-17" + "10:00" -> "17/07/2026 - 10:00"
  private formatDateTime(date: string, time: string | null): string {
    const [y, m, d] = date.split('-');
    const dmy = y && m && d ? `${d}/${m}/${y}` : date;
    return time ? `${dmy} - ${time}` : dmy;
  }

  private wrap(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  private drawFallback(
    doc: PDFDocument,
    t: PdfTicketInput,
    font: PDFFont,
    bold: PDFFont,
  ): void {
    const page = doc.addPage([FALLBACK_PAGE_W, FALLBACK_PAGE_H]);
    const lines: Array<{ text: string; size: number; f: PDFFont }> = [
      { text: t.eventTitle, size: 28, f: bold },
      { text: t.ticketTypeName, size: 16, f: font },
      { text: t.attendeeName, size: 22, f: bold },
      {
        text: `Día y hora: ${this.formatDateTime(t.attendanceDate, t.sessionTime)}`,
        size: 16,
        f: font,
      },
      { text: t.menuSummary ? `Menú: ${t.menuSummary}` : '', size: 16, f: font },
      {
        text: t.ticketNumber ? `Ticket nro: ${t.ticketNumber}` : '',
        size: 16,
        f: bold,
      },
    ].filter((l) => l.text);

    let y = FALLBACK_PAGE_H - MARGIN - 28;
    for (const l of lines) {
      page.drawText(this.sanitizeForFont(l.text, l.f), {
        x: MARGIN,
        y,
        size: l.size,
        font: l.f,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= l.size + 14;
    }
  }

  // Helvetica sólo soporta WinAnsiEncoding (CP-1252): tildes, ñ, ¡, ¿ y — son válidos,
  // pero un emoji u otro carácter fuera de ese set hace que pdf-lib arroje una excepción
  // SÍNCRONA al dibujar texto, abortando TODO el PDF (incluso para tickets ya pagados).
  // Sanitizamos el texto antes de dibujarlo, en vez de solo atrapar el error, para que
  // el ticket siga mostrando texto legible en lugar de una página en blanco.
  private sanitizeForFont(text: string, font: PDFFont): string {
    return Array.from(text)
      .filter((ch) => this.isEncodable(ch, font))
      .join('');
  }

  private isEncodable(ch: string, font: PDFFont): boolean {
    try {
      font.encodeText(ch);
      return true;
    } catch {
      return false;
    }
  }

  private async embedTemplate(
    doc: PDFDocument,
    url: string | null,
  ): Promise<PDFImage | null> {
    if (!url) return null;
    try {
      const bytes = await this.storage.getObjectByUrl(url);
      const isPng = url.toLowerCase().endsWith('.png');
      return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch (err) {
      // ponytail: si la plantilla falla, seguimos con layout por defecto.
      this.logger.warn(`No se pudo cargar plantilla ${url}: ${String(err)}`);
      return null;
    }
  }
}
