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
  spectacleType: string;
  attendeeName: string;
  attendanceDate: string;
  sessionTime: string | null;
  menuSummary?: string | null;
  ticketNumber?: string | null;
  customTemplateUrl: string | null;
  price?: number;
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
const FALLBACK_PAGE_W = 595; // A4 retrato, sin plantilla
const FALLBACK_PAGE_H = 842;
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
    const lines = this.wrap(
      this.sanitizeForFont(text, font),
      font,
      size,
      maxWidth,
    );

    let y = H - anchor.y * H;
    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const x =
        anchor.align === 'center' ? anchor.x * W - lineWidth / 2 : anchor.x * W;
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
    const W = FALLBACK_PAGE_W;
    const H = FALLBACK_PAGE_H;
    const page = doc.addPage([W, H]);
    let currentY = H - MARGIN;

    const drawLine = (y: number) => {
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: W - MARGIN, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
    };

    // Header
    const headerLeft = this.sanitizeForFont("Experiencias D'encanto", bold);
    const headerRight = this.sanitizeForFont('Ticket Reserva', bold);

    page.drawText(headerLeft, {
      x: MARGIN,
      y: currentY - 14,
      size: 14,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });

    const rightTextWidth = bold.widthOfTextAtSize(headerRight, 14);
    const rightBoxWidth = rightTextWidth + 20;
    const rightBoxHeight = 24;

    page.drawRectangle({
      x: W - MARGIN - rightBoxWidth,
      y: currentY - 19,
      width: rightBoxWidth,
      height: rightBoxHeight,
      color: rgb(0.9, 0.9, 0.9),
    });

    page.drawText(headerRight, {
      x: W - MARGIN - rightBoxWidth + 10,
      y: currentY - 14,
      size: 14,
      font: bold,
      color: rgb(0, 0, 0),
    });

    currentY -= 40;

    // Body
    const titleText = this.sanitizeForFont(t.eventTitle, bold);
    const titleLines = this.wrap(titleText, bold, 24, W - MARGIN * 2);
    for (const line of titleLines) {
      page.drawText(line, {
        x: MARGIN,
        y: currentY - 24,
        size: 24,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= 28;
    }
    currentY -= 6;
    drawLine(currentY);
    currentY -= 20;

    // Row: Tipo de espectaculo | Fecha
    const typeLabel = this.sanitizeForFont(
      `Tipo de espectáculo: ${t.spectacleType}`,
      font,
    );
    const dateTimeLabel = this.sanitizeForFont(
      `Fecha: ${this.formatDateTime(t.attendanceDate, t.sessionTime)}`,
      font,
    );

    page.drawText(typeLabel, { x: MARGIN, y: currentY - 12, size: 12, font });
    const dtWidth = font.widthOfTextAtSize(dateTimeLabel, 12);
    page.drawText(dateTimeLabel, {
      x: W - MARGIN - dtWidth,
      y: currentY - 12,
      size: 12,
      font,
    });
    currentY -= 22;
    drawLine(currentY);
    currentY -= 20;

    // Row: Dirección | Comuna
    const addrLabel = this.sanitizeForFont(
      'Dirección: Maipú 305, Barrio Yungay',
      font,
    );
    const comunaLabel = this.sanitizeForFont(
      'Comuna: Stgo Centro. Metro Quinta Normal.',
      font,
    );

    page.drawText(addrLabel, { x: MARGIN, y: currentY - 12, size: 12, font });
    const comunaWidth = font.widthOfTextAtSize(comunaLabel, 12);
    page.drawText(comunaLabel, {
      x: W - MARGIN - comunaWidth,
      y: currentY - 12,
      size: 12,
      font,
    });
    currentY -= 22;
    drawLine(currentY);
    currentY -= 20;

    // Row: Precio | Nombre
    const priceFormatted =
      t.price != null ? `$${t.price.toLocaleString('es-CL')}` : 'N/A';
    const priceLabel = this.sanitizeForFont(`Precio: ${priceFormatted}`, font);
    const nameLabel = this.sanitizeForFont(`Nombre: ${t.attendeeName}`, font);

    page.drawText(priceLabel, { x: MARGIN, y: currentY - 12, size: 12, font });
    const nameWidth = font.widthOfTextAtSize(nameLabel, 12);
    page.drawText(nameLabel, {
      x: W - MARGIN - nameWidth,
      y: currentY - 12,
      size: 12,
      font,
    });
    currentY -= 22;
    drawLine(currentY);
    currentY -= 20;

    // Row: Tipo de Ticket | Nro. Ticket
    const ticketTypeStr = this.sanitizeForFont(
      `Tipo de Ticket: ${t.ticketTypeName}`,
      bold,
    );
    const ticketStr = this.sanitizeForFont(
      t.ticketNumber ? `Nro. Ticket: ${t.ticketNumber}` : 'Nro. Ticket: -',
      bold,
    );
    page.drawText(ticketTypeStr, {
      x: MARGIN,
      y: currentY - 12,
      size: 12,
      font: bold,
    });
    const ticketWidth = bold.widthOfTextAtSize(ticketStr, 12);
    page.drawText(ticketStr, {
      x: W - MARGIN - ticketWidth,
      y: currentY - 12,
      size: 12,
      font: bold,
    });
    currentY -= 22;

    if (t.menuSummary) {
      drawLine(currentY);
      currentY -= 20;
      const menuStr = this.sanitizeForFont(`Menú: ${t.menuSummary}`, font);
      const menuLines = this.wrap(menuStr, font, 12, W - MARGIN * 2);
      for (const line of menuLines) {
        page.drawText(line, { x: MARGIN, y: currentY - 12, size: 12, font });
        currentY -= 16;
      }
      currentY -= 6;
    }

    // Footer
    currentY = MARGIN + 130;
    page.drawText(this.sanitizeForFont('Términos y Condiciones', bold), {
      x: MARGIN,
      y: currentY,
      size: 14,
      font: bold,
    });
    currentY -= 20;

    page.drawText(this.sanitizeForFont('RECUERDE:', bold), {
      x: MARGIN,
      y: currentY,
      size: 10,
      font: bold,
    });
    currentY -= 14;

    const term1 =
      '- Las funciones comienzan a la hora indicada. Una vez iniciado el espectáculo no se permitirá el ingreso al salón pasado los 15 minutos de la función/espectáculo, para no interrumpir la experiencia de los asistentes que llegaron puntualmente. Solo se podrá ingresar en el intermedio, en caso que la función cuente con uno. Debido a esto, se recomienda llegar con anticipación para evitar contratiempos.';
    const term2 =
      "- Experiencias D'encanto se reserva el derecho de modificar salas, elenco, fechas, horarios y obras por razones de fuerza mayor. Así como también el derecho de admisión y permanencia.";

    const term1Lines = this.wrap(
      this.sanitizeForFont(term1, font),
      font,
      9,
      W - MARGIN * 2,
    );
    for (const line of term1Lines) {
      page.drawText(line, { x: MARGIN, y: currentY, size: 9, font });
      currentY -= 12;
    }

    currentY -= 4;

    const term2Lines = this.wrap(
      this.sanitizeForFont(term2, font),
      font,
      9,
      W - MARGIN * 2,
    );
    for (const line of term2Lines) {
      page.drawText(line, { x: MARGIN, y: currentY, size: 9, font });
      currentY -= 12;
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
