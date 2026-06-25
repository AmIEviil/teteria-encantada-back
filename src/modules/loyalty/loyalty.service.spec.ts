import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) =>
      rows.find((r) =>
        Object.entries(where).every(
          ([k, v]) => (r as Record<string, unknown>)[k] === v,
        ),
      ) ?? null,
    ),
    find: jest.fn(async () => [...rows]),
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
      where: { userId: 'u1' } as Partial<LoyaltyAccount>,
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
      where: { userId: 'u1' } as Partial<LoyaltyAccount>,
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
});
