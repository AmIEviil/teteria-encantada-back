import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
  compare: jest.fn(),
}));

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    username: 'juan',
    first_name: 'Juan',
    last_name: 'Perez',
    email: 'juan@x.com',
    passwordHash: 'hashed-pw',
    isActive: true,
    role: { id: 'r1', name: 'Tecnico' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: Record<string, jest.Mock>;
  let roleRepo: Record<string, jest.Mock>;
  let jwt: { signAsync: jest.Mock };
  let userQb: Record<string, jest.Mock>;
  let roleQb: Record<string, jest.Mock>;

  beforeEach(async () => {
    jest.clearAllMocks();
    userQb = {
      leftJoinAndSelect: jest.fn(() => userQb),
      where: jest.fn(() => userQb),
      getOne: jest.fn().mockResolvedValue(null),
    };
    roleQb = {
      where: jest.fn(() => roleQb),
      getOne: jest.fn().mockResolvedValue({
        id: 'r1',
        name: 'Tecnico',
        isActive: true,
      }),
    };
    userRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 'u1', ...v })),
      createQueryBuilder: jest.fn(() => userQb),
    };
    roleRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      createQueryBuilder: jest.fn(() => roleQb),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('jwt-token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('crea usuario y devuelve token', async () => {
      const result = await service.register({
        username: 'Juan',
        first_name: ' Juan ',
        last_name: ' Perez ',
        email: 'JUAN@X.com',
        password: 'Secret123',
      } as never);
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.email).toBe('juan@x.com');
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('rechaza email duplicado', async () => {
      userRepo.findOneBy.mockResolvedValue(buildUser());
      await expect(
        service.register({
          username: 'Juan',
          first_name: 'Juan',
          email: 'juan@x.com',
          password: 'Secret123',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza username duplicado', async () => {
      userQb.getOne.mockResolvedValue(buildUser());
      await expect(
        service.register({
          username: 'Juan',
          first_name: 'Juan',
          email: 'juan@x.com',
          password: 'Secret123',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza rol inexistente', async () => {
      roleQb.getOne.mockResolvedValue(null);
      await expect(
        service.register({
          username: 'Juan',
          first_name: 'Juan',
          email: 'juan@x.com',
          password: 'Secret123',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createUser', () => {
    it('crea usuario y devuelve perfil publico', async () => {
      const result = await service.createUser({
        username: 'ana',
        first_name: 'Ana',
        email: 'ana@x.com',
        password: 'Secret123',
      } as never);
      expect(result.id).toBe('u1');
    });
  });

  describe('login', () => {
    it('login exitoso', async () => {
      userQb.getOne.mockResolvedValue(buildUser());
      bcryptMock.compare.mockResolvedValue(true as never);
      const result = await service.login({
        username: 'juan',
        password: 'Secret123',
      } as never);
      expect(result.accessToken).toBe('jwt-token');
    });

    it('rechaza usuario inexistente', async () => {
      userQb.getOne.mockResolvedValue(null);
      await expect(
        service.login({ username: 'x', password: 'y' } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza password invalida', async () => {
      userQb.getOne.mockResolvedValue(buildUser());
      bcryptMock.compare.mockResolvedValue(false as never);
      await expect(
        service.login({ username: 'juan', password: 'bad' } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('respuesta generica si no existe usuario', async () => {
      userRepo.findOneBy.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'x@x.com' } as never);
      expect(result.resetToken).toBeUndefined();
    });

    it('genera token si existe usuario activo', async () => {
      userRepo.findOneBy.mockResolvedValue(buildUser());
      const result = await service.forgotPassword({
        email: 'juan@x.com',
      } as never);
      expect(result.resetToken).toBeDefined();
      expect(userRepo.save).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const baseDto = {
      token: 'tok',
      newPassword: 'Secret123',
      confirmPassword: 'Secret123',
    };

    it('rechaza confirmacion distinta', async () => {
      await expect(
        service.resetPassword({ ...baseDto, confirmPassword: 'other' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza token invalido', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.resetPassword(baseDto as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza token expirado', async () => {
      userRepo.findOne.mockResolvedValue(
        buildUser({ resetPasswordExpiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.resetPassword(baseDto as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('actualiza contrasena', async () => {
      userRepo.findOne.mockResolvedValue(
        buildUser({ resetPasswordExpiresAt: new Date(Date.now() + 100000) }),
      );
      const result = await service.resetPassword(baseDto as never);
      expect(result.message).toContain('actualizada');
      expect(userRepo.save).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('devuelve perfil', async () => {
      userRepo.findOne.mockResolvedValue(buildUser());
      const result = await service.getProfile({ userId: 'u1' } as never);
      expect(result.id).toBe('u1');
    });

    it('lanza NotFound si no existe o inactivo', async () => {
      userRepo.findOne.mockResolvedValue(buildUser({ isActive: false }));
      await expect(
        service.getProfile({ userId: 'u1' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getRoles', () => {
    it('lista roles', async () => {
      roleRepo.find.mockResolvedValue([{ id: 'r1', name: 'Admin' }]);
      const result = await service.getRoles();
      expect(result).toEqual([{ id: 'r1', name: 'Admin' }]);
    });
  });

  describe('googleLogin', () => {
    const profile = {
      googleId: 'g-1',
      email: 'cliente@gmail.com',
      firstName: 'Cliente',
      lastName: 'Demo',
    };

    it('vincula googleId a un usuario existente por email', async () => {
      const existing = buildUser({
        id: 'u9',
        email: 'cliente@gmail.com',
        googleId: null,
      });
      userRepo.findOneBy.mockResolvedValueOnce(existing);

      const result = await service.googleLogin(profile);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u9', googleId: 'g-1' }),
      );
      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.email).toBe('cliente@gmail.com');
    });

    it('no re-vincula si el usuario ya tiene googleId', async () => {
      const existing = buildUser({ email: 'cliente@gmail.com', googleId: 'g-1' });
      userRepo.findOneBy.mockResolvedValueOnce(existing);

      await service.googleLogin(profile);

      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('crea usuario Google con rol Cliente si el email no existe', async () => {
      userRepo.findOneBy.mockResolvedValueOnce(null);
      roleQb.getOne.mockResolvedValueOnce({
        id: 'rc',
        name: 'Cliente',
        isActive: true,
      });

      const result = await service.googleLogin(profile);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'cliente@gmail.com',
          googleId: 'g-1',
          passwordHash: null,
          username: null,
        }),
      );
      expect(result.user.role.name).toBe('Cliente');
    });
  });

  describe('onModuleInit', () => {
    it('siembra roles faltantes y crea superadmin', async () => {
      roleRepo.find.mockResolvedValue([]); // ninguno existe -> crea todos
      process.env.AUTH_SEED_ADMIN_EMAIL = 'admin@x.com';
      process.env.AUTH_SEED_ADMIN_PASSWORD = 'Secret123';
      process.env.AUTH_SEED_ADMIN_USERNAME = 'admin';
      userRepo.findOneBy.mockResolvedValue(null);
      roleQb.getOne.mockResolvedValue({
        id: 'r1',
        name: 'Superadmin',
        isActive: true,
      });
      await service.onModuleInit();
      expect(roleRepo.save).toHaveBeenCalled();
      delete process.env.AUTH_SEED_ADMIN_EMAIL;
      delete process.env.AUTH_SEED_ADMIN_PASSWORD;
      delete process.env.AUTH_SEED_ADMIN_USERNAME;
    });

    it('no siembra si ya existen roles y no hay env admin', async () => {
      roleRepo.find.mockResolvedValue([
        { name: 'Superadmin' },
        { name: 'Admin' },
        { name: 'Tecnico' },
        { name: 'Cliente' },
      ]);
      delete process.env.AUTH_SEED_ADMIN_EMAIL;
      delete process.env.AUTH_SEED_ADMIN_PASSWORD;
      await service.onModuleInit();
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('no recrea admin si ya existe', async () => {
      roleRepo.find.mockResolvedValue([
        { name: 'Superadmin' },
        { name: 'Admin' },
        { name: 'Tecnico' },
        { name: 'Cliente' },
      ]);
      process.env.AUTH_SEED_ADMIN_EMAIL = 'admin@x.com';
      process.env.AUTH_SEED_ADMIN_PASSWORD = 'Secret123';
      userRepo.findOneBy.mockResolvedValue(buildUser());
      await service.onModuleInit();
      expect(userRepo.create).not.toHaveBeenCalled();
      delete process.env.AUTH_SEED_ADMIN_EMAIL;
      delete process.env.AUTH_SEED_ADMIN_PASSWORD;
    });
  });
});
