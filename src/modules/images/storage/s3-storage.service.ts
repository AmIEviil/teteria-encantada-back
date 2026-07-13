import { Inject, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const S3_CLIENT = 'S3_CLIENT';

@Injectable()
export class S3StorageService {
  constructor(@Inject(S3_CLIENT) private readonly client: S3Client) {}

  private get bucket(): string {
    return process.env.AWS_S3_BUCKET ?? '';
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // Base publica sin barras finales. Sin regex: `/\/+$/` dispara aviso de
  // backtracking super-lineal en el linter.
  private get publicUrlBase(): string | undefined {
    const raw = process.env.AWS_S3_PUBLIC_URL_BASE;
    if (!raw) return undefined;
    let end = raw.length;
    while (end > 0 && raw[end - 1] === '/') end--;
    return raw.slice(0, end);
  }

  publicUrl(key: string): string {
    const base = this.publicUrlBase;
    if (base) {
      return `${base}/${key}`;
    }
    const region = process.env.AWS_REGION ?? 'us-east-1';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async getObjectByUrl(url: string): Promise<Buffer> {
    const key = this.keyFromUrl(url);
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    // Body es un stream legible (Node)
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private keyFromUrl(url: string): string {
    const base = this.publicUrlBase;
    if (base && url.startsWith(base)) {
      return url.slice(base.length + 1);
    }
    // https://<bucket>.s3.<region>.amazonaws.com/<key>
    // decodeURIComponent: `publicUrl` embebe la key cruda, `new URL().pathname`
    // la devuelve percent-encoded; hay que revertirlo para recuperar la key exacta.
    const path = decodeURIComponent(new URL(url).pathname);
    let start = 0;
    while (start < path.length && path[start] === '/') start++;
    return path.slice(start);
  }
}
