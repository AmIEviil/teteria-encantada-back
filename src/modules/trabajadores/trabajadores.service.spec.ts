import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrabajadoresService } from './trabajadores.service';
import { AuthProvider, User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { Trabajador } from './entities/trabajador.entity';

type AnyRepo = Record<string, jest.Mock>;

const buildUser = (overrides = {}) => ({
  id: 'u1',
  username: 'juan',
  first_name: 'Juan',
  last_name: 'Perez',
  email: 'j@x.com',
  isActive: true,
  role: { id: 'r1', name: 'Admin' },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildTrabajador = (overrides = {}) => ({
  id: 'tr1',
  userId: 'u1',
  rut: '11.111.111-1',
  comuna: 'Santiago',
  direccion: 'calle 1',
  telefono: '123',
  fechaNacimiento: '1990-01-01',
  edad: 34,
  sueldo: 500000,
  fotoUrl: null,
  user: buildUser(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TrabajadoresService', () => {
  let service: TrabajadoresService;
  let userRepository: AnyRepo;
  let trabajadorRepository: AnyRepo;
  let roleRepository: AnyRepo;
  let qb: AnyRepo;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    userRepository = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    trabajadorRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((v) => ({ id: 'tr1', ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    roleRepository = {
      createQueryBuilder: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrabajadoresService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(Trabajador),
          useValue: trabajadorRepository,
        },
        { provide: getRepositoryToken(Role), useValue: roleRepository },
      ],
    }).compile();
    service = moduleRef.get(TrabajadoresService);
  });

  describe('findUsers', () => {
    it('aplica filtros y mapea trabajador asociado', async () => {
      qb.getManyAndCount.mockResolvedValue([[buildUser()], 1]);
      trabajadorRepository.find.mockResolvedValue([buildTrabajador()]);
      const result = await service.findUsers({
        page: 1,
        limit: 10,
        firstName: ' Juan ',
        lastName: ' Perez ',
        createdFrom: '2026-01-01',
        createdTo: '2026-12-31',
      } as never);
      expect(result.items[0].trabajador?.id).toBe('tr1');
      expect(result.pagination.totalItems).toBe(1);
    });

    it('usuarios sin trabajador', async () => {
      qb.getManyAndCount.mockResolvedValue([[buildUser()], 1]);
      trabajadorRepository.find.mockResolvedValue([]);
      const result = await service.findUsers({} as never);
      expect(result.items[0].trabajador).toBeNull();
    });

    it('sin usuarios no consulta trabajadores', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      const result = await service.findUsers({} as never);
      expect(trabajadorRepository.find).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(0);
    });

    it('onlyStaff excluye el rol Cliente', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.findUsers({ onlyStaff: true } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'role.name != :clienteRole',
        expect.objectContaining({ clienteRole: 'Cliente' }),
      );
    });
  });

  describe('create', () => {
    const dto = {
      userId: 'u1',
      rut: ' 11.111.111-1 ',
      comuna: ' Santiago ',
      direccion: ' calle ',
      telefono: ' 123 ',
      fechaNacimiento: '1990-01-01',
      edad: 34,
      sueldo: 500000,
      fotoUrl: ' http://f ',
    };

    it('crea trabajador', async () => {
      userRepository.findOne.mockResolvedValue(buildUser());
      trabajadorRepository.findOne
        .mockResolvedValueOnce(null) // existing trabajador
        .mockResolvedValueOnce(buildTrabajador()); // findOne final
      trabajadorRepository.findOneBy.mockResolvedValue(null);
      const result = await service.create(dto as never);
      expect(result.id).toBe('tr1');
    });

    it('rechaza usuario inexistente', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza usuario con trabajador existente', async () => {
      userRepository.findOne.mockResolvedValue(buildUser());
      trabajadorRepository.findOne.mockResolvedValue(buildTrabajador());
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rechaza RUT duplicado', async () => {
      userRepository.findOne.mockResolvedValue(buildUser());
      trabajadorRepository.findOne.mockResolvedValue(null);
      trabajadorRepository.findOneBy.mockResolvedValue(buildTrabajador());
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('devuelve trabajador', async () => {
      trabajadorRepository.findOne.mockResolvedValue(buildTrabajador());
      const result = await service.findOne('tr1');
      expect(result.id).toBe('tr1');
    });

    it('lanza NotFound', async () => {
      trabajadorRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('lanza NotFound', async () => {
      trabajadorRepository.findOne.mockResolvedValue(null);
      await expect(service.update('x', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza RUT en uso por otro', async () => {
      trabajadorRepository.findOne
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr1' }))
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr2' }));
      await expect(
        service.update('tr1', { rut: '22.222.222-2' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('actualiza datos del trabajador', async () => {
      trabajadorRepository.findOne
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr1' }))
        .mockResolvedValueOnce(null); // rut check (no conflict)
      const result = await service.update('tr1', {
        rut: '11.111.111-1',
        comuna: 'Maipu',
        sueldo: 600000,
      } as never);
      expect(result.id).toBe('tr1');
      expect(result.comuna).toBe('Maipu');
    });
  });

  describe('normalizacion de campos opcionales', () => {
    const baseDto = {
      userId: 'u1',
      rut: '11.111.111-1',
      comuna: 'Santiago',
      direccion: 'calle 1',
      telefono: '123',
      fechaNacimiento: '1990-01-01',
      edad: 34,
      sueldo: 500000,
    };

    it('create deja fotoUrl en null cuando llega vacia', async () => {
      trabajadorRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildTrabajador());
      userRepository.findOne.mockResolvedValue(buildUser());

      await service.create({ ...baseDto, fotoUrl: '   ' } as never);

      const created = trabajadorRepository.create.mock.calls[0][0] as {
        fotoUrl: string | null;
      };
      expect(created.fotoUrl).toBeNull();
    });

    it('update sin campos conserva los valores actuales', async () => {
      const existing = buildTrabajador();
      trabajadorRepository.findOne.mockResolvedValueOnce(existing);
      trabajadorRepository.save.mockImplementation((t: unknown) =>
        Promise.resolve(t),
      );

      const result = await service.update('tr1', {} as never);

      expect(result.rut).toBe('11.111.111-1');
      expect(result.comuna).toBe('Santiago');
      expect(result.sueldo).toBe(500000);
    });
  });

  describe('whitelist', () => {
    const rolTecnico = { id: 'role-1', name: 'Tecnico', isActive: true };

    const mockRoleQueryBuilder = () => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(rolTecnico),
    });

    it('crea un usuario sin password a partir del correo y el rol', async () => {
      userRepository.findOneBy.mockResolvedValue(null);
      roleRepository.createQueryBuilder.mockReturnValue(mockRoleQueryBuilder());
      userRepository.create.mockImplementation((data) => data);
      userRepository.save.mockImplementation((data) =>
        Promise.resolve({
          ...data,
          id: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.addToWhitelist({
        email: '  Pedro@Teteria.CL ',
        roleName: 'Tecnico',
      });

      const saved = userRepository.save.mock.calls[0][0];
      expect(saved.email).toBe('pedro@teteria.cl');
      expect(saved.username).toBeNull();
      expect(saved.passwordHash).toBeNull();
      expect(saved.provider).toBe(AuthProvider.GOOGLE);
      expect(saved.first_name).toBe('pedro');
      expect(saved.isActive).toBe(true);
      expect(result.email).toBe('pedro@teteria.cl');
    });

    it('rechaza un correo que ya existe', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 'user-9' });

      await expect(
        service.addToWhitelist({
          email: 'pedro@teteria.cl',
          roleName: 'Tecnico',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza un rol inexistente', async () => {
      userRepository.findOneBy.mockResolvedValue(null);
      roleRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.addToWhitelist({
          email: 'pedro@teteria.cl',
          roleName: 'Fantasma',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('desactivar deja al usuario inactivo', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'pedro@teteria.cl',
        username: null,
        first_name: 'pedro',
        last_name: null,
        isActive: true,
        role: rolTecnico,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userRepository.save.mockImplementation((data) => Promise.resolve(data));
      trabajadorRepository.findOneBy.mockResolvedValue(null);

      const result = await service.setWhitelistActive('user-1', false);

      expect(result.isActive).toBe(false);
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
