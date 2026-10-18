import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiskStorageService } from './disk-storage.service';

describe('DiskStorageService', () => {
  let tmp: string;
  let service: DiskStorageService;
  const prevDir = process.env.UPLOADS_DIR;
  const prevUrl = process.env.PUBLIC_API_URL;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-'));
    process.env.UPLOADS_DIR = tmp;
    process.env.PUBLIC_API_URL = 'https://x.cl/api/';
    service = new DiskStorageService();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevDir;
    if (prevUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = prevUrl;
  });

  it('putObject escribe y getObject devuelve el mismo buffer', async () => {
    const buf = Buffer.from('hola');
    await service.putObject('images/a.png', buf, 'image/png');
    expect(await service.getObject('images/a.png')).toEqual(buf);
    expect(fs.existsSync(path.join(tmp, 'images', 'a.png'))).toBe(true);
  });

  it('putObject crea carpetas intermedias', async () => {
    await service.putObject(
      'ventas/2026-10/123-tickets.pdf',
      Buffer.from('pdf'),
      'application/pdf',
    );
    expect(
      fs.existsSync(path.join(tmp, 'ventas', '2026-10', '123-tickets.pdf')),
    ).toBe(true);
  });

  it('publicUrl arma la URL sin barras duplicadas', () => {
    expect(service.publicUrl('images/a.png')).toBe(
      'https://x.cl/api/uploads/images/a.png',
    );
  });

  it('getObjectByUrl no depende del dominio', async () => {
    const buf = Buffer.from('img');
    await service.putObject('images/a.png', buf, 'image/png');
    expect(
      await service.getObjectByUrl(
        'https://otro-dominio.cl/api/uploads/images/a.png',
      ),
    ).toEqual(buf);
  });

  it('deleteObject borra y no lanza si ya no existe', async () => {
    await service.putObject('images/a.png', Buffer.from('x'), 'image/png');
    await service.deleteObject('images/a.png');
    expect(fs.existsSync(path.join(tmp, 'images', 'a.png'))).toBe(false);
    await expect(service.deleteObject('images/a.png')).resolves.toBeUndefined();
  });

  it('rechaza rutas fuera de UPLOADS_DIR', async () => {
    await expect(service.getObject('../secreto.txt')).rejects.toThrow(
      'Ruta fuera de UPLOADS_DIR',
    );
    await expect(service.getObject('ventas/../../x')).rejects.toThrow(
      'Ruta fuera de UPLOADS_DIR',
    );
    await expect(
      service.getObjectByUrl('https://x.cl/api/uploads/../../etc/passwd'),
    ).rejects.toThrow('Ruta fuera de UPLOADS_DIR');
  });
});
