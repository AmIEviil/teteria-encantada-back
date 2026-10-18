import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import * as path from 'path';

export const uploadsRoot = (): string =>
  path.resolve(process.env.UPLOADS_DIR ?? './uploads');

const OUT_OF_ROOT = 'Ruta fuera de UPLOADS_DIR';

@Injectable()
export class DiskStorageService {
  // Toda clave pasa por aqui: evita path traversal (`../`) fuera de UPLOADS_DIR.
  private resolveKey(key: string): string {
    const root = uploadsRoot();
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(OUT_OF_ROOT);
    }
    return full;
  }

  // `contentType` se conserva por compatibilidad con la firma anterior (S3);
  // en disco el tipo se deduce de la extension al servir.
  async putObject(
    key: string,
    body: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _contentType: string,
  ): Promise<void> {
    const full = this.resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async deleteObject(key: string): Promise<void> {
    const full = this.resolveKey(key);
    try {
      await unlink(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  // Base publica sin barras finales. Sin regex: `/\/+$/` dispara aviso de
  // backtracking super-lineal en el linter.
  publicUrl(key: string): string {
    const raw = process.env.PUBLIC_API_URL ?? '';
    let end = raw.length;
    while (end > 0 && raw[end - 1] === '/') end--;
    return `${raw.slice(0, end)}/uploads/${key}`;
  }

  async getObjectByUrl(url: string): Promise<Buffer> {
    return this.getObject(this.keyFromUrl(url));
  }

  private keyFromUrl(url: string): string {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const marker = '/uploads/';
    const idx = pathname.indexOf(marker);
    if (idx === -1) throw new Error(OUT_OF_ROOT);
    return pathname.slice(idx + marker.length);
  }
}
