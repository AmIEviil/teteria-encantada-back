import { Inject, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
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

  publicUrl(key: string): string {
    const base = process.env.AWS_S3_PUBLIC_URL_BASE?.replace(/\/+$/, '');
    if (base) {
      return `${base}/${key}`;
    }
    const region = process.env.AWS_REGION ?? 'us-east-1';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }
}
