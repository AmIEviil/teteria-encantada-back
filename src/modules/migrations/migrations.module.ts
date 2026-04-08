import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MigrationAudit } from './entities/migration-audit.entity';
import { MigrationsController } from './migrations.controller';
import { MigrationService } from './migrations.service';

@Module({
  imports: [TypeOrmModule.forFeature([MigrationAudit])],
  controllers: [MigrationsController],
  providers: [MigrationService],
  exports: [MigrationService],
})
export class MigrationsModule {}
