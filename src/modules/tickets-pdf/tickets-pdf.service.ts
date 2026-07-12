import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { S3StorageService } from '../images/storage/s3-storage.service';

export interface PdfTicketInput {
  eventTitle: string;
  ticketTypeName: string;
  attendeeName: string;
  attendanceDate: string;
  sessionTime: string | null;
  customTemplateUrl: string | null;
}

// ponytail: layout fijo. Perillas de calibración; hacer coords configurables si
// las plantillas varían mucho de tamaño.
const PAGE_W = 842; // A4 apaisado (pt)
const PAGE_H = 595;
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
      const page = doc.addPage([PAGE_W, PAGE_H]);
      await this.drawBackground(doc, page, t.customTemplateUrl);

      const lines: Array<{ text: string; size: number; f: typeof font }> = [
        { text: t.eventTitle, size: 28, f: bold },
        { text: `${t.ticketTypeName}`, size: 16, f: font },
        { text: t.attendeeName, size: 22, f: bold },
        { text: `Fecha: ${t.attendanceDate}`, size: 16, f: font },
        { text: t.sessionTime ? `Horario: ${t.sessionTime}` : 'Horario: —', size: 16, f: font },
      ];

      let y = PAGE_H - MARGIN - 28;
      for (const l of lines) {
        page.drawText(l.text, {
          x: MARGIN, y, size: l.size, font: l.f, color: rgb(0.1, 0.1, 0.1),
        });
        y -= l.size + 14;
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  private async drawBackground(
    doc: PDFDocument,
    page: import('pdf-lib').PDFPage,
    url: string | null,
  ): Promise<void> {
    if (!url) return;
    try {
      const bytes = await this.storage.getObjectByUrl(url);
      const isPng = url.toLowerCase().endsWith('.png');
      const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    } catch (err) {
      // ponytail: si la plantilla falla, seguimos con layout por defecto.
      this.logger.warn(`No se pudo cargar plantilla ${url}: ${String(err)}`);
    }
  }
}
