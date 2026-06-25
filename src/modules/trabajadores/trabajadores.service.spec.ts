import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrabajadoresService } from './trabajadores.service';
import { User } from '../auth/entities/user.entity';
import { Trabajador } from './entities/trabajador.entity';
import { TrabajadorDocumento } from './entities/trabajador-documento.entity';

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
  documentos: [],
  user: buildUser(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TrabajadoresService', () => {
  let service: TrabajadoresService;
  let userRepo: AnyRepo;
  let trabajadorRepo: AnyRepo;
  let documentoRepo: AnyRepo;
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
    userRepo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
    };
    trabajadorRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((v) => ({ id: 'tr1', ...v })),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    documentoRepo = { create: jest.fn((v) => v) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TrabajadoresService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Trabajador), useValue: trabajadorRepo },
        {
          provide: getRepositoryToken(TrabajadorDocumento),
          useValue: documentoRepo,
        },
      ],
    }).compile();
    service = moduleRef.get(TrabajadoresService);
  });

  describe('findUsers', () => {
    it('aplica filtros y mapea trabajador asociado', async () => {
      qb.getManyAndCount.mockResolvedValue([[buildUser()], 1]);
      trabajadorRepo.find.mockResolvedValue([buildTrabajador()]);
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
      trabajadorRepo.find.mockResolvedValue([]);
      const result = await service.findUsers({} as never);
      expect(result.items[0].trabajador).toBeNull();
    });

    it('sin usuarios no consulta trabajadores', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      const result = await service.findUsers({} as never);
      expect(trabajadorRepo.find).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(0);
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
      documentos: [
        {
          nombreArchivo: ' doc ',
          rutaArchivo: ' /ruta ',
          tipoMime: ' application/pdf ',
          tamanoBytes: 100,
          descripcion: ' desc ',
        },
      ],
    };

    it('crea trabajador', async () => {
      userRepo.findOne.mockResolvedValue(buildUser());
      trabajadorRepo.findOne
        .mockResolvedValueOnce(null) // existing trabajador
        .mockResolvedValueOnce(buildTrabajador()); // findOne final
      trabajadorRepo.findOneBy.mockResolvedValue(null);
      const result = await service.create(dto as never);
      expect(result.id).toBe('tr1');
      expect(documentoRepo.create).toHaveBeenCalled();
    });

    it('rechaza usuario inexistente', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza usuario con trabajador existente', async () => {
      userRepo.findOne.mockResolvedValue(buildUser());
      trabajadorRepo.findOne.mockResolvedValue(buildTrabajador());
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rechaza RUT duplicado', async () => {
      userRepo.findOne.mockResolvedValue(buildUser());
      trabajadorRepo.findOne.mockResolvedValue(null);
      trabajadorRepo.findOneBy.mockResolvedValue(buildTrabajador());
      await expect(service.create(dto as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('devuelve trabajador', async () => {
      trabajadorRepo.findOne.mockResolvedValue(
        buildTrabajador({
          documentos: [
            {
              id: 'd1',
              nombreArchivo: 'a',
              rutaArchivo: '/a',
              tipoMime: null,
              tamanoBytes: null,
              descripcion: null,
              createdAt: new Date(),
            },
          ],
        }),
      );
      const result = await service.findOne('tr1');
      expect(result.documentos).toHaveLength(1);
    });

    it('lanza NotFound', async () => {
      trabajadorRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('lanza NotFound', async () => {
      trabajadorRepo.findOne.mockResolvedValue(null);
      await expect(service.update('x', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza RUT en uso por otro', async () => {
      trabajadorRepo.findOne
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr1' }))
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr2' }));
      await expect(
        service.update('tr1', { rut: '22.222.222-2' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('actualiza con documentos', async () => {
      trabajadorRepo.findOne
        .mockResolvedValueOnce(buildTrabajador({ id: 'tr1' }))
        .mockResolvedValueOnce(null); // rut check (no conflict)
      const result = await service.update('tr1', {
        rut: '11.111.111-1',
        comuna: 'Maipu',
        sueldo: 600000,
        documentos: [{ nombreArchivo: 'd', rutaArchivo: '/d' }],
      } as never);
      expect(documentoRepo.create).toHaveBeenCalled();
      expect(result.id).toBe('tr1');
    });
  });
});
