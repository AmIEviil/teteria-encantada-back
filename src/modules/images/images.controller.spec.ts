import { ImagesController } from './images.controller';

describe('ImagesController', () => {
  let controller: ImagesController;
  const service = {
    upload: jest.fn().mockResolvedValue({ id: 'img-1', url: 'http://cdn/x' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ImagesController(service as never);
  });

  it('upload devuelve id y url', async () => {
    const result = await controller.upload({
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: 'x.png',
      size: 3,
    } as never);
    expect(result).toEqual({ id: 'img-1', url: 'http://cdn/x' });
  });

  it('remove devuelve mensaje', async () => {
    const result = await controller.remove('img-1');
    expect(service.remove).toHaveBeenCalledWith('img-1');
    expect(result.message).toContain('eliminada');
  });
});
