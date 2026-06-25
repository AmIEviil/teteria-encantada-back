import { ImagesService, type UploadableFile } from './images.service';
import { Image } from './entities/image.entity';

describe('ImagesService', () => {
  const storage = {
    putObject: jest.fn(),
    deleteObject: jest.fn(),
    publicUrl: jest.fn(),
  };

  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };

  const buildService = () => new ImagesService(repo as never, storage as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const file: UploadableFile = {
    buffer: Buffer.from('data'),
    mimetype: 'image/png',
    originalname: 'foto.png',
    size: 4,
  };

  it('upload sube a S3 y persiste la fila Image', async () => {
    storage.publicUrl.mockReturnValue('https://cdn/x.png');
    repo.create.mockImplementation((data: Partial<Image>) => data);
    repo.save.mockImplementation(async (data: Image) => ({
      id: 'img-1',
      ...data,
    }));

    const service = buildService();
    const result = await service.upload(file);

    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/.+\.png$/),
      file.buffer,
      'image/png',
    );
    expect(result).toMatchObject({
      id: 'img-1',
      url: 'https://cdn/x.png',
      mimeType: 'image/png',
      size: 4,
    });
    expect(result.key).toMatch(/^images\/.+\.png$/);
  });

  it('remove borra de S3 y de BD cuando la imagen existe', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'img-1', key: 'images/x.png' });
    const service = buildService();

    await service.remove('img-1');

    expect(storage.deleteObject).toHaveBeenCalledWith('images/x.png');
    expect(repo.delete).toHaveBeenCalledWith('img-1');
  });

  it('remove no hace nada si la imagen no existe', async () => {
    repo.findOneBy.mockResolvedValue(null);
    const service = buildService();

    await service.remove('missing');

    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
