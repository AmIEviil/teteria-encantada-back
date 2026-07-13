import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyConfig } from './entities/loyalty-config.entity';
import { LoyaltyLevel } from './entities/loyalty-level.entity';
import { LoyaltyReward } from './entities/loyalty-reward.entity';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';

// Repos in-memory simples (Map) — sin BD real.
function memRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  return {
    rows,
    create: (d: Partial<T>) => ({ ...d }) as T,
    save: jest.fn(async (e: T) => {
      if (!e.id) (e as { id: string }).id = `id-${rows.length + 1}`;
      const i = rows.findIndex((r) => r.id === e.id);
      if (i >= 0) rows[i] = e;
      else rows.push(e);
      return e;
    }),
    findOne: jest.fn(
      async ({ where }: { where: Partial<T> }) =>
        rows.find((r) =>
          Object.entries(where).every(
            ([k, v]) => (r as Record<string, unknown>)[k] === v,
          ),
        ) ?? null,
    ),
    find: jest.fn(async (options?: { where?: Partial<T> }) => {
      const where = options?.where;
      if (!where) return [...rows];
      return rows.filter((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      );
    }),
    delete: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<T> & { rows: T[] };
}

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let accounts: ReturnType<typeof memRepo<LoyaltyAccount>>;
  let levels: ReturnType<typeof memRepo<LoyaltyLevel>>;
  let configRepo: ReturnType<typeof memRepo<LoyaltyConfig>>;
  let rewards: ReturnType<typeof memRepo<LoyaltyReward>>;
  let txns: ReturnType<typeof memRepo<LoyaltyTransaction>>;

  beforeEach(async () => {
    accounts = memRepo<LoyaltyAccount>();
    levels = memRepo<LoyaltyLevel>();
    configRepo = memRepo<LoyaltyConfig>();
    rewards = memRepo<LoyaltyReward>();
    txns = memRepo<LoyaltyTransaction>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: getRepositoryToken(LoyaltyConfig), useValue: configRepo },
        { provide: getRepositoryToken(LoyaltyLevel), useValue: levels },
        { provide: getRepositoryToken(LoyaltyReward), useValue: rewards },
        { provide: getRepositoryToken(LoyaltyAccount), useValue: accounts },
        {
          provide: getRepositoryToken(LoyaltyTransaction),
          useValue: txns,
        },
      ],
    }).compile();
    service = moduleRef.get(LoyaltyService);

    // semilla: config 1 pto/unidad, dos niveles
    configRepo.rows.push({
      id: 'cfg',
      attendancePointsEnabled: true,
      purchasePointsEnabled: true,
      purchasePointsRate: 1,
    } as LoyaltyConfig);
    levels.rows.push({
      id: 'lvl0',
      name: 'Base',
      threshold: 0,
      sortOrder: 0,
    } as LoyaltyLevel);
    levels.rows.push({
      id: 'lvl1',
      name: 'Plata',
      threshold: 100,
      sortOrder: 1,
    } as LoyaltyLevel);
  });

  it('earnPurchase suma puntos y sube de nivel', async () => {
    await service.earnPurchase('u1', 'o1', 150);
    const acc = await accounts.findOne({
      where: { userId: 'u1' } as FindOptionsWhere<LoyaltyAccount>,
    });
    expect(acc?.points).toBe(150);
    expect(acc?.currentLevelId).toBe('lvl1');
    expect(txns.rows).toHaveLength(1);
    expect(txns.rows[0].points).toBe(150);
  });

  it('no suma puntos si purchasePointsEnabled=false', async () => {
    configRepo.rows[0].purchasePointsEnabled = false;
    await service.earnPurchase('u1', 'o1', 150);
    const acc = await accounts.findOne({
      where: { userId: 'u1' } as FindOptionsWhere<LoyaltyAccount>,
    });
    expect(acc).toBeNull();
  });

  it('redeem descuenta saldo y registra REDEEM', async () => {
    await service.earnPurchase('u1', 'o1', 150);
    rewards.rows.push({
      id: 'rw1',
      levelId: 'lvl1',
      type: 'DISCOUNT_CODE',
      description: '10% off',
      cost: 100,
      params: null,
      isActive: true,
    } as unknown as LoyaltyReward);
    const acc = await service.redeem('u1', 'rw1');
    expect(acc.points).toBe(50);
    expect(
      txns.rows.some((t) => t.type === 'REDEEM' && t.points === -100),
    ).toBe(true);
  });

  it('redeem falla si saldo insuficiente', async () => {
    await service.earnPurchase('u1', 'o1', 50);
    rewards.rows.push({
      id: 'rw1',
      levelId: 'lvl0',
      type: 'DISCOUNT_CODE',
      description: 'x',
      cost: 100,
      params: null,
      isActive: true,
    } as unknown as LoyaltyReward);
    await expect(service.redeem('u1', 'rw1')).rejects.toThrow();
  });

  const pushReward = (overrides: Partial<LoyaltyReward> = {}) => {
    const reward = {
      id: 'rw1',
      levelId: 'lvl0',
      type: 'DISCOUNT_CODE',
      description: 'x',
      cost: 10,
      params: null,
      isActive: true,
      ...overrides,
    } as unknown as LoyaltyReward;
    rewards.rows.push(reward);
    return reward;
  };

  describe('config', () => {
    it('getConfig crea la configuracion por defecto si no existe', async () => {
      configRepo.rows.length = 0;
      const config = await service.getConfig();
      expect(configRepo.save).toHaveBeenCalled();
      expect(config).toBeDefined();
    });

    it('updateConfig mezcla los campos enviados', async () => {
      const config = await service.updateConfig({ purchasePointsRate: 5 });
      expect(config.purchasePointsRate).toBe(5);
      expect(config.purchasePointsEnabled).toBe(true);
    });
  });

  describe('devengo', () => {
    it('no suma puntos si el monto no alcanza para 1 punto', async () => {
      configRepo.rows[0].purchasePointsRate = 0;
      await service.earnPurchase('u1', 'o1', 150);
      expect(txns.rows).toHaveLength(0);
    });

    it('earnAttendance suma puntos de asistencia', async () => {
      await service.earnAttendance('u1', 'ev-1', 30);
      const account = await accounts.findOne({
        where: { userId: 'u1' } as FindOptionsWhere<LoyaltyAccount>,
      });
      expect(account?.points).toBe(30);
      expect(txns.rows[0].type).toBe('EARN_ATTENDANCE');
      expect(txns.rows[0].referenceType).toBe('event');
    });

    it('earnAttendance no suma si esta deshabilitado', async () => {
      configRepo.rows[0].attendancePointsEnabled = false;
      await service.earnAttendance('u1', 'ev-1', 30);
      expect(txns.rows).toHaveLength(0);
    });

    it('earnAttendance ignora puntos no positivos', async () => {
      await service.earnAttendance('u1', 'ev-1', 0);
      expect(txns.rows).toHaveLength(0);
    });

    it('usa los repos del EntityManager cuando se pasa una transaccion', async () => {
      const manager = {
        getRepository: jest.fn((entity: unknown) =>
          entity === LoyaltyAccount ? accounts : txns,
        ),
      };
      await service.earnPurchase(
        'u1',
        'o1',
        120,
        manager as unknown as EntityManager,
      );
      expect(manager.getRepository).toHaveBeenCalled();
      const account = await accounts.findOne({
        where: { userId: 'u1' } as FindOptionsWhere<LoyaltyAccount>,
      });
      expect(account?.points).toBe(120);
    });

    it('acumula sobre una cuenta existente', async () => {
      await service.earnPurchase('u1', 'o1', 40);
      await service.earnPurchase('u1', 'o2', 30);
      const account = await accounts.findOne({
        where: { userId: 'u1' } as FindOptionsWhere<LoyaltyAccount>,
      });
      expect(account?.points).toBe(70);
      expect(account?.currentLevelId).toBe('lvl0');
    });
  });

  describe('redeem', () => {
    it('falla si la recompensa no existe', async () => {
      await expect(service.redeem('u1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('falla si la recompensa esta inactiva', async () => {
      pushReward({ isActive: false });
      await expect(service.redeem('u1', 'rw1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('falla si el usuario no tiene cuenta', async () => {
      pushReward();
      await expect(service.redeem('u1', 'rw1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('falla si no alcanzo el nivel de la recompensa', async () => {
      await service.earnPurchase('u1', 'o1', 50);
      pushReward({ levelId: 'lvl1', cost: 10 });
      await expect(service.redeem('u1', 'rw1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('falla si el nivel de la recompensa no existe', async () => {
      await service.earnPurchase('u1', 'o1', 50);
      pushReward({ levelId: 'lvl-x' });
      await expect(service.redeem('u1', 'rw1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('baja de nivel si el canje deja el saldo bajo el umbral', async () => {
      await service.earnPurchase('u1', 'o1', 120);
      pushReward({ levelId: 'lvl1', cost: 100 });
      const account = await service.redeem('u1', 'rw1');
      expect(account.points).toBe(20);
      expect(account.currentLevelId).toBe('lvl0');
    });
  });

  describe('getSummary', () => {
    it('devuelve cero puntos y sin nivel cuando no hay cuenta', async () => {
      const summary = await service.getSummary('u1');
      expect(summary.points).toBe(0);
      expect(summary.currentLevel?.id).toBe('lvl0');
      expect(summary.nextLevel?.id).toBe('lvl1');
      expect(summary.rewards).toEqual([]);
    });

    it('solo expone recompensas activas de niveles alcanzados', async () => {
      await service.earnPurchase('u1', 'o1', 100);
      pushReward({ id: 'rw-base', levelId: 'lvl0' });
      pushReward({ id: 'rw-plata', levelId: 'lvl1' });
      pushReward({ id: 'rw-off', levelId: 'lvl0', isActive: false });

      const summary = await service.getSummary('u1');

      expect(summary.points).toBe(100);
      expect(summary.currentLevel?.id).toBe('lvl1');
      expect(summary.nextLevel).toBeNull();
      expect(summary.rewards.map((reward) => reward.id).sort()).toEqual([
        'rw-base',
        'rw-plata',
      ]);
    });
  });

  describe('CRUD admin', () => {
    it('lista niveles', async () => {
      const result = await service.listLevels();
      expect(result).toHaveLength(2);
    });

    it('crea nivel', async () => {
      const level = await service.createLevel({ name: 'Oro', threshold: 500 });
      expect(level.name).toBe('Oro');
      expect(levels.save).toHaveBeenCalled();
    });

    it('actualiza nivel existente', async () => {
      const level = await service.updateLevel('lvl1', { name: 'Plata Plus' });
      expect(level.name).toBe('Plata Plus');
    });

    it('falla al actualizar nivel inexistente', async () => {
      await expect(
        service.updateLevel('lvl-x', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('elimina nivel', async () => {
      const result = await service.deleteLevel('lvl1');
      expect(result.message).toContain('eliminado');
      expect(levels.delete).toHaveBeenCalledWith('lvl1');
    });

    it('crea recompensa', async () => {
      const reward = await service.createReward({ cost: 50 });
      expect(reward.cost).toBe(50);
    });

    it('actualiza recompensa existente', async () => {
      pushReward();
      const reward = await service.updateReward('rw1', { cost: 99 });
      expect(reward.cost).toBe(99);
    });

    it('falla al actualizar recompensa inexistente', async () => {
      await expect(
        service.updateReward('rw-x', { cost: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('elimina recompensa', async () => {
      const result = await service.deleteReward('rw1');
      expect(result.message).toContain('eliminada');
      expect(rewards.delete).toHaveBeenCalledWith('rw1');
    });
  });
});
