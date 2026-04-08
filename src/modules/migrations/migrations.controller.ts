import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { MigrationActionDto } from './dto/migration-action.dto';
import { MigrationService } from './migrations.service';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('migrations')
@Roles(SYSTEM_ROLES.SUPERADMIN)
export class MigrationsController {
  constructor(private readonly migrationService: MigrationService) {}

  @Get('status')
  getMigrationsStatus(
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<unknown> {
    const normalizedOrder = order === 'desc' ? 'desc' : 'asc';

    return this.migrationService.getMigrationsStatus(normalizedOrder);
  }

  @Get('history')
  getMigrationHistory(@Query('migrationName') migrationName?: string) {
    return this.migrationService.getMigrationHistory(migrationName);
  }

  @Post('execute')
  executeMigration(
    @Body() payload: MigrationActionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.migrationService.executeMigration(
      payload.migrationName,
      request.user.userId,
    );
  }

  @Post('revert')
  revertMigration(
    @Body() payload: MigrationActionDto,
    @Req() request: RequestWithUser,
  ) {
    return this.migrationService.revertMigration(
      payload.migrationName,
      request.user.userId,
    );
  }

  @Post('execute-all')
  executeAllPendingMigrations() {
    return this.migrationService.executeAllPendingMigrations();
  }

  @Post('revert-last')
  revertLastMigration() {
    return this.migrationService.revertLastMigration();
  }
}
