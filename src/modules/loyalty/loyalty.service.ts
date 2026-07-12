import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LoyaltyConfig } from './entities/loyalty-config.entity';
import { LoyaltyLevel } from './entities/loyalty-level.entity';
import { LoyaltyReward } from './entities/loyalty-reward.entity';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import {
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from './entities/loyalty-transaction.entity';
import { purchasePoints, resolveLevelId } from './utils/points';

export interface LoyaltySummary {
  points: number;
  currentLevel: LoyaltyLevel | null;
  nextLevel: LoyaltyLevel | null;
  rewards: LoyaltyReward[];
}

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyConfig)
    private readonly configRepo: Repository<LoyaltyConfig>,
    @InjectRepository(LoyaltyLevel)
    private readonly levelRepo: Repository<LoyaltyLevel>,
    @InjectRepository(LoyaltyReward)
    private readonly rewardRepo: Repository<LoyaltyReward>,
    @InjectRepository(LoyaltyAccount)
    private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTransaction)
    private readonly txnRepo: Repository<LoyaltyTransaction>,
  ) {}

  async getConfig(): Promise<LoyaltyConfig> {
    const existing = await this.configRepo.find();
    if (existing.length > 0) return existing[0];
    return this.configRepo.save(this.configRepo.create({}));
  }

  async updateConfig(dto: Partial<LoyaltyConfig>): Promise<LoyaltyConfig> {
    const config = await this.getConfig();
    Object.assign(config, dto);
    return this.configRepo.save(config);
  }

  // --- devengo ---
  async earnPurchase(
    userId: string,
    orderId: string,
    orderTotal: number,
    manager?: EntityManager,
  ): Promise<void> {
    const config = await this.getConfig();
    if (!config.purchasePointsEnabled) return;
    const pts = purchasePoints(orderTotal, config.purchasePointsRate);
    if (pts <= 0) return;
    await this.applyEarn(
      userId,
      pts,
      LoyaltyTransactionType.EARN_PURCHASE,
      'order',
      orderId,
      manager,
    );
  }

  async earnAttendance(
    userId: string,
    eventId: string,
    points: number,
    manager?: EntityManager,
  ): Promise<void> {
    const config = await this.getConfig();
    if (!config.attendancePointsEnabled || points <= 0) return;
    await this.applyEarn(
      userId,
      points,
      LoyaltyTransactionType.EARN_ATTENDANCE,
      'event',
      eventId,
      manager,
    );
  }

  private async applyEarn(
    userId: string,
    points: number,
    type: LoyaltyTransactionType,
    referenceType: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const accountRepo = manager
      ? manager.getRepository(LoyaltyAccount)
      : this.accountRepo;
    const txnRepo = manager
      ? manager.getRepository(LoyaltyTransaction)
      : this.txnRepo;

    let account = await accountRepo.findOne({ where: { userId } });
    if (!account) {
      account = accountRepo.create({ userId, points: 0, currentLevelId: null });
    }
    account.points += points;
    account.currentLevelId = await this.resolveLevel(account.points);
    await accountRepo.save(account);
    await txnRepo.save(
      txnRepo.create({ userId, type, points, referenceType, referenceId }),
    );
  }

  private async resolveLevel(points: number): Promise<string | null> {
    const levels = await this.levelRepo.find();
    return resolveLevelId(
      points,
      levels.map((l) => ({ id: l.id, threshold: l.threshold })),
    );
  }

  // --- canje ---
  async redeem(userId: string, rewardId: string): Promise<LoyaltyAccount> {
    const reward = await this.rewardRepo.findOne({ where: { id: rewardId } });
    if (!reward || !reward.isActive) {
      throw new NotFoundException('Recompensa no disponible');
    }
    const account = await this.accountRepo.findOne({ where: { userId } });
    if (!account) {
      throw new BadRequestException('Sin cuenta de fidelización');
    }
    // requiere haber alcanzado el nivel de la recompensa
    const level = await this.levelRepo.findOne({
      where: { id: reward.levelId },
    });
    if (!level || account.points < level.threshold) {
      throw new BadRequestException('Nivel insuficiente para esta recompensa');
    }
    if (account.points < reward.cost) {
      throw new BadRequestException('Saldo insuficiente');
    }
    account.points -= reward.cost;
    account.currentLevelId = await this.resolveLevel(account.points);
    await this.accountRepo.save(account);
    await this.txnRepo.save(
      this.txnRepo.create({
        userId,
        type: LoyaltyTransactionType.REDEEM,
        points: -reward.cost,
        referenceType: 'reward',
        referenceId: reward.id,
      }),
    );
    return account;
  }

  // --- consulta cliente ---
  async getSummary(userId: string): Promise<LoyaltySummary> {
    const account = await this.accountRepo.findOne({ where: { userId } });
    const points = account?.points ?? 0;
    const levels = (await this.levelRepo.find()).sort(
      (a, b) => a.threshold - b.threshold,
    );
    const currentLevel =
      [...levels].reverse().find((l) => l.threshold <= points) ?? null;
    const nextLevel = levels.find((l) => l.threshold > points) ?? null;
    const reachableLevelIds = new Set(
      levels.filter((l) => l.threshold <= points).map((l) => l.id),
    );
    const activeRewards = await this.rewardRepo.find({
      where: { isActive: true },
    });
    return {
      points,
      currentLevel,
      nextLevel,
      rewards: activeRewards.filter((r) => reachableLevelIds.has(r.levelId)),
    };
  }

  // --- CRUD admin ---
  listLevels(): Promise<LoyaltyLevel[]> {
    return this.levelRepo.find({ order: { sortOrder: 'ASC' } });
  }
  createLevel(dto: Partial<LoyaltyLevel>): Promise<LoyaltyLevel> {
    return this.levelRepo.save(this.levelRepo.create(dto));
  }
  async updateLevel(
    id: string,
    dto: Partial<LoyaltyLevel>,
  ): Promise<LoyaltyLevel> {
    const level = await this.levelRepo.findOne({ where: { id } });
    if (!level) throw new NotFoundException('Nivel no encontrado');
    Object.assign(level, dto);
    return this.levelRepo.save(level);
  }
  async deleteLevel(id: string): Promise<{ message: string }> {
    await this.levelRepo.delete(id);
    return { message: 'Nivel eliminado' };
  }
  createReward(dto: Partial<LoyaltyReward>): Promise<LoyaltyReward> {
    return this.rewardRepo.save(this.rewardRepo.create(dto));
  }
  async updateReward(
    id: string,
    dto: Partial<LoyaltyReward>,
  ): Promise<LoyaltyReward> {
    const reward = await this.rewardRepo.findOne({ where: { id } });
    if (!reward) throw new NotFoundException('Recompensa no encontrada');
    Object.assign(reward, dto);
    return this.rewardRepo.save(reward);
  }
  async deleteReward(id: string): Promise<{ message: string }> {
    await this.rewardRepo.delete(id);
    return { message: 'Recompensa eliminada' };
  }
}
