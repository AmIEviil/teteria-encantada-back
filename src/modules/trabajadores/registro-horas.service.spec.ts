import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { RegistroHora } from './entities/registro-hora.entity';
import { Trabajador } from './entities/trabajador.entity';
import { RegistroHorasService } from './registro-horas.service';
import { todayInSantiago } from '../../common/date/santiago-date';

const adminUser: AuthUser = {
  userId: 'user-admin',
  username: 'admin',
  email: 'admin@teteria.cl',
  role: 'Admin',
};

const tecnicoUser: AuthUser = {
  userId: 'user-tec',
  username: null,
  email: 'pedro@teteria.cl',
  role: 'Tecnico',
};

describe('RegistroHorasService', () => {
  let service: RegistroHorasService;
  let registroRepository: {
    findOneBy: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let trabajadorRepository: { findOneBy: jest.Mock };

  beforeEach(async () => {
    registroRepository = {
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    trabajadorRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'trab-tec', userId: 'user-tec' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistroHorasService,
        {
          provide: getRepositoryToken(RegistroHora),
          useValue: registroRepository,
        },
        {
          provide: getRepositoryToken(Trabajador),
          useValue: trabajadorRepository,
        },
      ],
    }).compile();

    service = module.get(RegistroHorasService);
  });

  it('crea el registro cuando el día no tiene horas', async () => {
    registroRepository.findOneBy.mockResolvedValue(null);

    const result = await service.upsert(adminUser, {
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 7.5,
    });

    expect(registroRepository.create).toHaveBeenCalledWith({
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 7.5,
    });
    expect(result).toEqual({ fecha: '2026-07-10', horas: 7.5 });
  });

  it('reemplaza el valor cuando el día ya tiene horas (no suma)', async () => {
    registroRepository.findOneBy.mockResolvedValue({
      id: 'reg-1',
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 4,
    });

    const result = await service.upsert(adminUser, {
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 6,
    });

    expect(registroRepository.create).not.toHaveBeenCalled();
    expect(registroRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reg-1', horas: 6 }),
    );
    expect(result).toEqual({ fecha: '2026-07-10', horas: 6 });
  });

  it('con 0 horas borra el registro del día', async () => {
    const existing = {
      id: 'reg-1',
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 4,
    };
    registroRepository.findOneBy.mockResolvedValue(existing);

    const result = await service.upsert(adminUser, {
      trabajadorId: 'trab-1',
      fecha: '2026-07-10',
      horas: 0,
    });

    expect(registroRepository.remove).toHaveBeenCalledWith(existing);
    expect(result).toBeNull();
  });

  it('rechaza una fecha futura', async () => {
    await expect(
      service.upsert(adminUser, {
        trabajadorId: 'trab-1',
        fecha: '2999-01-01',
        horas: 8,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta el día de hoy', async () => {
    registroRepository.findOneBy.mockResolvedValue(null);

    const result = await service.upsert(adminUser, {
      trabajadorId: 'trab-1',
      fecha: todayInSantiago(),
      horas: 8,
    });

    expect(result?.horas).toBe(8);
  });

  it('un tecnico no puede registrar horas de otro trabajador', async () => {
    await expect(
      service.upsert(tecnicoUser, {
        trabajadorId: 'trab-otro',
        fecha: '2026-07-10',
        horas: 8,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un tecnico sin trabajadorId usa su propio trabajador', async () => {
    registroRepository.findOneBy.mockResolvedValue(null);

    await service.upsert(tecnicoUser, { fecha: '2026-07-10', horas: 8 });

    expect(registroRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ trabajadorId: 'trab-tec' }),
    );
  });

  it('un tecnico no puede consultar las horas de otro trabajador', async () => {
    await expect(
      service.findMonth(tecnicoUser, {
        trabajadorId: 'trab-otro',
        mes: '2026-07',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('devuelve los registros del mes y el total', async () => {
    registroRepository.find.mockResolvedValue([
      { fecha: '2026-07-01', horas: 8 },
      { fecha: '2026-07-02', horas: 4.5 },
    ]);

    const result = await service.findMonth(adminUser, {
      trabajadorId: 'trab-1',
      mes: '2026-07',
    });

    expect(registroRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trabajadorId: 'trab-1' }),
      }),
    );
    expect(result.items).toEqual([
      { fecha: '2026-07-01', horas: 8 },
      { fecha: '2026-07-02', horas: 4.5 },
    ]);
    expect(result.totalHoras).toBe(12.5);
    expect(result.mes).toBe('2026-07');
  });
});
