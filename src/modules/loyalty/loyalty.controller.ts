import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { LoyaltyService, LoyaltySummary } from './loyalty.service';
import { RedeemDto } from './dto/redeem.dto';
import { LoyaltyConfig } from './entities/loyalty-config.entity';
import { LoyaltyLevel } from './entities/loyalty-level.entity';
import { LoyaltyReward } from './entities/loyalty-reward.entity';
import { LoyaltyAccount } from './entities/loyalty-account.entity';

interface RequestWithUser {
  user: AuthUser;
}

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ---- cliente ----
  @Get('me')
  getMe(@Req() req: RequestWithUser): Promise<LoyaltySummary> {
    return this.loyaltyService.getSummary(req.user.userId);
  }

  @Post('redeem')
  redeem(
    @Req() req: RequestWithUser,
    @Body() dto: RedeemDto,
  ): Promise<LoyaltyAccount> {
    return this.loyaltyService.redeem(req.user.userId, dto.rewardId);
  }

  // ---- admin ----
  @Get('config')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  getConfig(): Promise<LoyaltyConfig> {
    return this.loyaltyService.getConfig();
  }

  @Patch('config')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  updateConfig(@Body() dto: Partial<LoyaltyConfig>): Promise<LoyaltyConfig> {
    return this.loyaltyService.updateConfig(dto);
  }

  @Get('levels')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  listLevels(): Promise<LoyaltyLevel[]> {
    return this.loyaltyService.listLevels();
  }

  @Post('levels')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  createLevel(@Body() dto: Partial<LoyaltyLevel>): Promise<LoyaltyLevel> {
    return this.loyaltyService.createLevel(dto);
  }

  @Patch('levels/:id')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  updateLevel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<LoyaltyLevel>,
  ): Promise<LoyaltyLevel> {
    return this.loyaltyService.updateLevel(id, dto);
  }

  @Delete('levels/:id')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  deleteLevel(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.loyaltyService.deleteLevel(id);
  }

  @Post('rewards')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  createReward(@Body() dto: Partial<LoyaltyReward>): Promise<LoyaltyReward> {
    return this.loyaltyService.createReward(dto);
  }

  @Patch('rewards/:id')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  updateReward(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<LoyaltyReward>,
  ): Promise<LoyaltyReward> {
    return this.loyaltyService.updateReward(id, dto);
  }

  @Delete('rewards/:id')
  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  deleteReward(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.loyaltyService.deleteReward(id);
  }
}
