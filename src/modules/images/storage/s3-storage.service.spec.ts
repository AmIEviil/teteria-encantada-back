import { S3StorageService, S3_CLIENT } from './s3-storage.service';

describe('S3StorageService', () => {
  const send = jest.fn();
  const fakeClient = { send } as unknown as import('@aws-sdk/client-s3').S3Client;

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
    process.env.AWS_S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.AWS_S3_PUBLIC_URL_BASE;
  });

  const buildService = () => new S3StorageService(fakeClient);

  it('putObject envía un PutObjectCommand con bucket, key y body', async () => {
    const service = buildService();
    await service.putObject('images/abc.png', Buffer.from('x'), 'image/png');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'images/abc.png',
      ContentType: 'image/png',
    });
  });

  it('publicUrl construye la URL por defecto del bucket', () => {
    const service = buildService();
    expect(service.publicUrl('images/abc.png')).toBe(
      'https://test-bucket.s3.us-east-1.amazonaws.com/images/abc.png',
    );
  });

  it('publicUrl respeta AWS_S3_PUBLIC_URL_BASE si está definida', () => {
    process.env.AWS_S3_PUBLIC_URL_BASE = 'https://cdn.example.com';
    const service = buildService();
    expect(service.publicUrl('images/abc.png')).toBe(
      'https://cdn.example.com/images/abc.png',
    );
  });

  it('deleteObject envía un DeleteObjectCommand con la key', async () => {
    const service = buildService();
    await service.deleteObject('images/abc.png');

    const command = send.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'images/abc.png',
    });
  });
});
