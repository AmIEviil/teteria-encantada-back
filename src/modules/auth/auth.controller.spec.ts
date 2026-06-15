import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    register: jest.fn().mockResolvedValue({ accessToken: 't' }),
    login: jest.fn().mockResolvedValue({ accessToken: 't' }),
    forgotPassword: jest.fn().mockResolvedValue({ message: 'm' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'm' }),
    getProfile: jest.fn().mockResolvedValue({ id: 'u1' }),
    getRoles: jest.fn().mockResolvedValue([]),
    createUser: jest.fn().mockResolvedValue({ id: 'u1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: APP_GUARD, useValue: { canActivate: () => true } },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('register', async () => {
    await controller.register({} as never);
    expect(service.register).toHaveBeenCalled();
  });
  it('login', async () => {
    await controller.login({} as never);
    expect(service.login).toHaveBeenCalled();
  });
  it('forgotPassword', async () => {
    await controller.forgotPassword({} as never);
    expect(service.forgotPassword).toHaveBeenCalled();
  });
  it('resetPassword', async () => {
    await controller.resetPassword({} as never);
    expect(service.resetPassword).toHaveBeenCalled();
  });
  it('profile', async () => {
    await controller.profile({ user: { userId: 'u1' } } as never);
    expect(service.getProfile).toHaveBeenCalledWith({ userId: 'u1' });
  });
  it('roles', async () => {
    await controller.roles();
    expect(service.getRoles).toHaveBeenCalled();
  });
  it('createUser', async () => {
    await controller.createUser({} as never);
    expect(service.createUser).toHaveBeenCalled();
  });
});
