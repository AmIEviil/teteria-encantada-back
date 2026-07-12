import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoyaltyConfig } from './entities/loyalty-config.entity';
import { LoyaltyLevel } from './entities/loyalty-level.entity';
import { LoyaltyReward } from './entities/loyalty-reward.entity';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyConfig,
      LoyaltyLevel,
      LoyaltyReward,
      LoyaltyAccount,
      LoyaltyTransaction,
    ]),
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
