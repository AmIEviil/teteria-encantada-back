import { TicketsPdfService } from './tickets-pdf.service';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'zlib';

// Extrae el texto dibujado con drawText leyendo los content streams del PDF
// (decodifica cadenas hex "<..>" y literales "(..)" antes de "Tj", como WinAnsi/Latin-1).
function extractDrawnText(pdfBytes: Buffer): string {
  const raw = pdfBytes.toString('latin1');
  let result = '';
  let idx = 0;
  while (true) {
    const streamIdx = raw.indexOf('stream', idx);
    if (streamIdx === -1) break;
    let dataStart = streamIdx + 6;
    if (raw[dataStart] === '\r') dataStart++;
    if (raw[dataStart] === '\n') dataStart++;
    const endIdx = raw.indexOf('endstream', dataStart);
    if (endIdx === -1) break;
    const rawBytes = pdfBytes.subarray(dataStart, endIdx);
    try {
      const inflated = inflateSync(rawBytes).toString('latin1');
      if (inflated.includes('BT')) {
        for (const m of inflated.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
          result += Buffer.from(m[1], 'hex').toString('latin1');
        }
        for (const m of inflated.matchAll(/\(([^()]*)\)\s*Tj/g)) {
          result += m[1];
        }
      }
    } catch {
      // no era un stream flate (o no correspondía a contenido de página)
    }
    idx = endIdx + 9;
  }
  return result;
}

describe('TicketsPdfService', () => {
  const storage = { getObjectByUrl: jest.fn() };
  const svc = new TicketsPdfService(storage as any);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('genera un PDF con una página por ticket (layout por defecto)', async () => {
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'Noche de Té',
        ticketTypeName: 'VIP',
        spectacleType: 'EVENTO',
        attendeeName: 'Ana Díaz',
        attendanceDate: '2026-08-01',
        sessionTime: '20:00',
        customTemplateUrl: null,
      },
      {
        eventTitle: 'Noche de Té',
        ticketTypeName: 'VIP',
        spectacleType: 'EVENTO',
        attendeeName: 'Luis Paz',
        attendanceDate: '2026-08-01',
        sessionTime: '20:00',
        customTemplateUrl: null,
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(2);
    expect(storage.getObjectByUrl).not.toHaveBeenCalled();
  });

  it('usa la plantilla PNG como fondo cuando hay customTemplateUrl', async () => {
    // PNG 1x1 transparente
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    storage.getObjectByUrl.mockResolvedValue(png);
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'E',
        ticketTypeName: 'T',
        spectacleType: 'EVENTO',
        attendeeName: 'N',
        attendanceDate: '2026-08-01',
        sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.png',
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.png');
  });

  it('la página respeta el ratio de la plantilla y estampa los valores en ella', async () => {
    // PNG 1x1 -> página cuadrada: prueba que el alto sale del ratio de la
    // imagen y no del A4 fijo (que deformaba las plantillas 16:9).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    storage.getObjectByUrl.mockResolvedValue(png);
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'Coraline',
        ticketTypeName: 'General',
        spectacleType: 'EVENTO',
        attendeeName: 'Ana Díaz',
        attendanceDate: '2026-07-17',
        sessionTime: '10:00',
        menuSummary: 'Té + scone',
        ticketNumber: '#17071001',
        customTemplateUrl: 'https://s3/tpl.png',
      },
    ]);
    const doc = await PDFDocument.load(buf);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(842);
    expect(Math.round(page.getHeight())).toBe(842);

    const text = extractDrawnText(buf);
    expect(text).toContain('Ana Díaz');
    expect(text).toContain('17/07/2026 - 10:00');
    expect(text).toContain('Té + scone');
    expect(text).toContain('#17071001');
    // El título y el tipo ya vienen impresos en la plantilla: no se redibujan.
    expect(text).not.toContain('Coraline');
  });

  it('si falla la descarga de la plantilla, igual genera el PDF con layout por defecto', async () => {
    storage.getObjectByUrl.mockRejectedValue(new Error('S3 unreachable'));
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'E',
        ticketTypeName: 'T',
        spectacleType: 'EVENTO',
        attendeeName: 'N',
        attendanceDate: '2026-08-01',
        sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.png',
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.png');
  });

  it('no revienta con emoji en el título y conserva acentos en el nombre', async () => {
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'Noche de Té 🎉',
        ticketTypeName: 'VIP',
        spectacleType: 'EVENTO',
        attendeeName: 'Ana Muñoz Díaz',
        attendanceDate: '2026-08-01',
        sessionTime: '20:00',
        customTemplateUrl: null,
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    const text = extractDrawnText(buf);
    expect(text).toContain('Ana Muñoz Díaz');
  });

  it('si la plantilla es una imagen corrupta/no embebible, igual genera el PDF', async () => {
    storage.getObjectByUrl.mockResolvedValue(
      Buffer.from('esto no es una imagen valida'),
    );
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'E',
        ticketTypeName: 'T',
        spectacleType: 'EVENTO',
        attendeeName: 'N',
        attendanceDate: '2026-08-01',
        sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.png',
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.png');
  });

  it('si la extensión de la plantilla no es png/jpg, igual genera el PDF', async () => {
    storage.getObjectByUrl.mockResolvedValue(
      Buffer.from('contenido cualquiera'),
    );
    const buf = await svc.buildTicketsPdf([
      {
        eventTitle: 'E',
        ticketTypeName: 'T',
        spectacleType: 'EVENTO',
        attendeeName: 'N',
        attendanceDate: '2026-08-01',
        sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.webp',
      },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.webp');
  });
});
