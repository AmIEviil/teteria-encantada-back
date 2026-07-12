import { S3StorageService } from './s3-storage.service';

describe('S3StorageService', () => {
  const send = jest.fn();
  const fakeClient = {
    send,
  } as unknown as import('@aws-sdk/client-s3').S3Client;

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

  describe('getObjectByUrl', () => {
    it('descarga el objeto y retorna un Buffer', async () => {
      async function* gen() {
        yield Buffer.from('PDFBYTES');
      }
      send.mockResolvedValue({ Body: gen() });
      const service = buildService();
      const buf = await service.getObjectByUrl(
        'https://test-bucket.s3.us-east-1.amazonaws.com/images/abc.png',
      );
      expect(buf.toString()).toBe('PDFBYTES');
      const cmd = send.mock.calls[0][0];
      expect(cmd.input.Key).toBe('images/abc.png');
    });

    it('hace round-trip con la URL real generada por publicUrl()', async () => {
      async function* gen() {
        yield Buffer.from('ROUNDTRIP');
      }
      send.mockResolvedValue({ Body: gen() });
      const service = buildService();
      const key = 'tickets/templates/xyz.png';
      const url = service.publicUrl(key);
      const buf = await service.getObjectByUrl(url);
      expect(buf.toString()).toBe('ROUNDTRIP');
      const cmd = send.mock.calls[0][0];
      expect(cmd.input.Key).toBe(key);
    });

    it('deriva el key correctamente cuando AWS_S3_PUBLIC_URL_BASE está seteado', async () => {
      process.env.AWS_S3_PUBLIC_URL_BASE = 'https://cdn.example.com/assets/';
      async function* gen() {
        yield Buffer.from('CDNBYTES');
      }
      send.mockResolvedValue({ Body: gen() });
      const service = buildService();
      const key = 'images/abc.png';
      const url = service.publicUrl(key);
      expect(url).toBe('https://cdn.example.com/assets/images/abc.png');
      const buf = await service.getObjectByUrl(url);
      expect(buf.toString()).toBe('CDNBYTES');
      const cmd = send.mock.calls[0][0];
      expect(cmd.input.Key).toBe(key);
    });
  });
});
