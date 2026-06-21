import { UnauthorizedException } from '@nestjs/common';
import { JwtValidationMiddleware } from './jwt-validation.middleware';

describe('JwtValidationMiddleware', () => {
  let middleware: JwtValidationMiddleware;
  let jwt: { verifyAsync: jest.Mock };
  let userRepo: { createQueryBuilder: jest.Mock };
  let qb: Record<string, jest.Mock>;
  let next: jest.Mock;

  const makeReq = (overrides: Record<string, unknown> = {}) =>
    ({
      method: 'GET',
      originalUrl: '/products',
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...overrides,
    }) as never;

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(null),
    };
    jwt = { verifyAsync: jest.fn() };
    userRepo = { createQueryBuilder: jest.fn(() => qb) };
    next = jest.fn();
    middleware = new JwtValidationMiddleware(jwt as never, userRepo as never);
  });

  it('deja pasar OPTIONS', async () => {
    await middleware.use(makeReq({ method: 'OPTIONS' }), {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar ruta publica', async () => {
    await middleware.use(
      makeReq({ originalUrl: '/auth/login' }),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar /auth/google sin Authorization header', async () => {
    await middleware.use(
      makeReq({ originalUrl: '/auth/google' }),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar /auth/google/callback sin Authorization header', async () => {
    await middleware.use(
      makeReq({ originalUrl: '/auth/google/callback' }),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar /api/auth/google sin Authorization header', async () => {
    await middleware.use(
      makeReq({ originalUrl: '/api/auth/google' }),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar /api/auth/google/callback sin Authorization header', async () => {
    await middleware.use(
      makeReq({ originalUrl: '/api/auth/google/callback' }),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalled();
  });

  it('deja pasar ruta del sistema', async () => {
    await middleware.use(makeReq({ originalUrl: '/health' }), {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('rechaza sin header Bearer', async () => {
    await expect(
      middleware.use(makeReq(), {} as never, next),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('autentica con username y usa x-forwarded-for', async () => {
    jwt.verifyAsync.mockResolvedValue({ username: 'juan', email: 'j@x.com' });
    qb.getOne.mockResolvedValue({
      id: 'u1',
      email: 'j@x.com',
      username: 'juan',
      isActive: true,
      first_name: 'Juan',
      last_name: null,
      role: { name: 'Admin' },
    });
    const req = makeReq({
      headers: {
        authorization: 'Bearer tok',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });
    await middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as { user: { role: string } }).user.role).toBe('Admin');
  });

  it('autentica con email cuando no hay username', async () => {
    jwt.verifyAsync.mockResolvedValue({ email: 'j@x.com' });
    qb.getOne.mockResolvedValue({
      id: 'u1',
      email: 'j@x.com',
      username: null,
      isActive: true,
      first_name: 'Juan',
      last_name: null,
      role: null,
    });
    const req = makeReq({ headers: { authorization: 'Bearer tok' } });
    await middleware.use(req, {} as never, next);
    expect((req as { user: { role: string | null } }).user.role).toBeNull();
  });

  it('rechaza payload sin identificador', async () => {
    jwt.verifyAsync.mockResolvedValue({});
    await expect(
      middleware.use(
        makeReq({ headers: { authorization: 'Bearer tok' } }),
        {} as never,
        next,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza usuario no encontrado', async () => {
    jwt.verifyAsync.mockResolvedValue({ email: 'j@x.com' });
    qb.getOne.mockResolvedValue(null);
    await expect(
      middleware.use(
        makeReq({ headers: { authorization: 'Bearer tok' } }),
        {} as never,
        next,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza usuario inactivo', async () => {
    jwt.verifyAsync.mockResolvedValue({ email: 'j@x.com' });
    qb.getOne.mockResolvedValue({ id: 'u1', isActive: false });
    await expect(
      middleware.use(
        makeReq({ headers: { authorization: 'Bearer tok' } }),
        {} as never,
        next,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza token invalido', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
    await expect(
      middleware.use(
        makeReq({ headers: { authorization: 'Bearer tok' } }),
        {} as never,
        next,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
