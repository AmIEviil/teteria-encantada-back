import { TicketsPdfService } from './tickets-pdf.service';
import { PDFDocument } from 'pdf-lib';

describe('TicketsPdfService', () => {
  const storage = { getObjectByUrl: jest.fn() };
  const svc = new TicketsPdfService(storage as any);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('genera un PDF con una página por ticket (layout por defecto)', async () => {
    const buf = await svc.buildTicketsPdf([
      { eventTitle: 'Noche de Té', ticketTypeName: 'VIP', attendeeName: 'Ana Díaz',
        attendanceDate: '2026-08-01', sessionTime: '20:00', customTemplateUrl: null },
      { eventTitle: 'Noche de Té', ticketTypeName: 'VIP', attendeeName: 'Luis Paz',
        attendanceDate: '2026-08-01', sessionTime: '20:00', customTemplateUrl: null },
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
      { eventTitle: 'E', ticketTypeName: 'T', attendeeName: 'N',
        attendanceDate: '2026-08-01', sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.png' },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.png');
  });

  it('si falla la descarga de la plantilla, igual genera el PDF con layout por defecto', async () => {
    storage.getObjectByUrl.mockRejectedValue(new Error('S3 unreachable'));
    const buf = await svc.buildTicketsPdf([
      { eventTitle: 'E', ticketTypeName: 'T', attendeeName: 'N',
        attendanceDate: '2026-08-01', sessionTime: null,
        customTemplateUrl: 'https://s3/tpl.png' },
    ]);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(storage.getObjectByUrl).toHaveBeenCalledWith('https://s3/tpl.png');
  });
});
