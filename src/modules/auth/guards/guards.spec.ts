import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

const makeContext = (user: unknown) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('RolesGuard', () => {
  it('permite si no hay roles requeridos', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(makeContext({ role: 'Admin' }))).toBe(true);
  });

  it('permite si el rol coincide', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['Admin']),
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(makeContext({ role: 'Admin' }))).toBe(true);
  });

  it('rechaza si el rol no coincide', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['Admin']),
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(makeContext({ role: 'Cliente' }))).toBe(false);
  });

  it('rechaza si no hay usuario', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['Admin']),
    };
    const guard = new RolesGuard(reflector as never);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});

describe('JwtAuthGuard', () => {
  it('permite rutas publicas sin pasar por passport', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new JwtAuthGuard(reflector as never);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('delega en passport para rutas protegidas', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(reflector as never);
    const superSpy = jest
      .spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)) as {
          canActivate: () => boolean;
        },
        'canActivate',
      )
      .mockReturnValue(true);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
    superSpy.mockRestore();
  });
});
