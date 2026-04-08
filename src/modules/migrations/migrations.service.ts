/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import {
  MigrationAudit,
  MigrationAuditAction,
} from './entities/migration-audit.entity';

type SortOrder = 'asc' | 'desc';

interface MigrationStatusItem {
  name: string;
  timestamp: string | null;
}

interface NamedMigration {
  name?: string;
  constructor: {
    name: string;
  };
}

@Injectable()
export class MigrationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MigrationAudit)
    private readonly migrationAuditRepo: Repository<MigrationAudit>,
  ) {}

  async getMigrationsStatus(order: SortOrder = 'asc') {
    const orderDirection = order === 'desc' ? 'DESC' : 'ASC';
    const executedMigrations = await this.getExecutedMigrations(orderDirection);

    const allMigrations = this.dataSource.migrations;
    const allLocalMigrationNames = allMigrations.map((migration) =>
      this.getMigrationName(migration),
    );

    const executedNames = executedMigrations.map(
      (migration: { name: string }) => {
        return migration.name;
      },
    );
    const pending = allLocalMigrationNames.filter(
      (name) => !executedNames.includes(name),
    );

    const executed: MigrationStatusItem[] = executedMigrations.map(
      (migration: { name: string; timestamp: string | null }) => {
        return {
          name: migration.name,
          timestamp:
            migration.timestamp !== null && migration.timestamp !== undefined
              ? String(migration.timestamp)
              : null,
        };
      },
    );

    const pendingWithDates: MigrationStatusItem[] = pending.map((name) => {
      return {
        name,
        timestamp: this.extractTimestampFromName(name),
      };
    });

    return {
      executed: this.sortByDate(executed, order),
      pending: this.sortByDate(pendingWithDates, order),
      order,
      summary: {
        totalExecuted: executed.length,
        totalPending: pending.length,
        totalMigrations: allLocalMigrationNames.length,
      },
    };
  }

  async executeMigration(migrationName: string, userId: string) {
    const migrationToRun = this.findMigrationByName(migrationName);

    if (!migrationToRun) {
      throw new NotFoundException(`Migracion ${migrationName} no encontrada`);
    }

    const auditEntry = this.migrationAuditRepo.create({
      migrationName,
      action: MigrationAuditAction.EXECUTE,
      userId,
      details: { migrationName, userId },
      success: true,
      errorMessage: null,
    });

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await migrationToRun.up(queryRunner);

      await this.ensureMigrationsTableExists(queryRunner);

      await queryRunner.query(
        `INSERT INTO ${this.getMigrationsTablePath()} ("timestamp", "name") VALUES ($1, $2)`,
        [Date.now().toString(), migrationName],
      );

      await queryRunner.commitTransaction();

      const savedAudit = await this.migrationAuditRepo.save(auditEntry);

      return {
        success: true,
        message: `Migracion ${migrationName} ejecutada correctamente`,
        migration: migrationName,
        executedBy: userId,
        auditId: savedAudit.id,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      auditEntry.success = false;
      auditEntry.errorMessage = this.getErrorMessage(error);
      await this.migrationAuditRepo.save(auditEntry);

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async revertMigration(migrationName: string, userId: string) {
    const migrationToRevert = this.findMigrationByName(migrationName);

    if (!migrationToRevert) {
      throw new NotFoundException(`Migracion ${migrationName} no encontrada`);
    }

    const auditEntry = this.migrationAuditRepo.create({
      migrationName,
      action: MigrationAuditAction.REVERT,
      userId,
      details: { migrationName, userId },
      success: true,
      errorMessage: null,
    });

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const migrationsTableExists =
        await this.migrationsTableExists(queryRunner);

      if (!migrationsTableExists) {
        throw new NotFoundException(
          `La migracion ${migrationName} no esta ejecutada`,
        );
      }

      const executedMigrations = await queryRunner.query(
        `SELECT "name" FROM ${this.getMigrationsTablePath()} WHERE "name" = $1`,
        [migrationName],
      );

      if (executedMigrations.length === 0) {
        throw new NotFoundException(
          `La migracion ${migrationName} no esta ejecutada`,
        );
      }

      await migrationToRevert.down(queryRunner);

      await queryRunner.query(
        `DELETE FROM ${this.getMigrationsTablePath()} WHERE "name" = $1`,
        [migrationName],
      );

      await queryRunner.commitTransaction();

      const savedAudit = await this.migrationAuditRepo.save(auditEntry);

      return {
        success: true,
        message: `Migracion ${migrationName} revertida correctamente`,
        migration: migrationName,
        revertedBy: userId,
        auditId: savedAudit.id,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      auditEntry.success = false;
      auditEntry.errorMessage = this.getErrorMessage(error);
      await this.migrationAuditRepo.save(auditEntry);

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async executeAllPendingMigrations() {
    const result = await this.dataSource.runMigrations();
    const executedNames = result.map((migration) =>
      this.getMigrationName(migration),
    );

    return {
      success: true,
      message: `${executedNames.length} migraciones ejecutadas`,
      executedMigrations: executedNames,
    };
  }

  async revertLastMigration() {
    await this.dataSource.undoLastMigration();

    return {
      success: true,
      message: 'Ultima migracion revertida',
      reverted: true,
    };
  }

  async getMigrationHistory(migrationName?: string) {
    const query = this.migrationAuditRepo
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .orderBy('audit.executedAt', 'DESC');

    if (migrationName) {
      query.where('audit.migrationName = :migrationName', { migrationName });
    }

    return query.getMany();
  }

  private extractTimestampFromName(migrationName: string): string | null {
    const match = migrationName.match(/\d+/);
    return match ? match[0] : null;
  }

  private sortByDate(items: MigrationStatusItem[], order: SortOrder) {
    return [...items].sort((a, b) => {
      const timeA = this.parseTimestamp(a.timestamp);
      const timeB = this.parseTimestamp(b.timestamp);

      return order === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }

  private parseTimestamp(timestamp: string | null): number {
    if (!timestamp) {
      return 0;
    }

    const parsed = Number.parseInt(timestamp, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private findMigrationByName(migrationName: string) {
    return this.dataSource.migrations.find((migration) => {
      return this.getMigrationName(migration) === migrationName;
    });
  }

  private getMigrationName(migration: NamedMigration): string {
    return migration.name ?? migration.constructor.name;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Error desconocido al ejecutar migracion';
  }

  private async getExecutedMigrations(orderDirection: 'ASC' | 'DESC') {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      const migrationsTableExists =
        await this.migrationsTableExists(queryRunner);

      if (!migrationsTableExists) {
        return [];
      }

      return queryRunner.query(
        `SELECT "timestamp", "name" FROM ${this.getMigrationsTablePath()} ORDER BY "timestamp" ${orderDirection}`,
      ) as Promise<Array<{ timestamp: string | null; name: string }>>;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureMigrationsTableExists(queryRunner: QueryRunner) {
    const migrationsTableExists = await this.migrationsTableExists(queryRunner);

    if (migrationsTableExists) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ${this.getMigrationsTablePath()} ("id" SERIAL PRIMARY KEY, "timestamp" bigint NOT NULL, "name" character varying NOT NULL)`,
    );
  }

  private async migrationsTableExists(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT to_regclass($1) as regclass`,
      [this.getMigrationsTableRegclassName()],
    );

    return Boolean(result?.[0]?.regclass);
  }

  private getMigrationsTableName(): string {
    const options = this.dataSource.options as {
      migrationsTableName?: string;
    };

    return options.migrationsTableName ?? 'migrations';
  }

  private getMigrationsSchema(): string | null {
    const options = this.dataSource.options as {
      schema?: string;
    };

    return options.schema ?? null;
  }

  private getMigrationsTablePath(): string {
    const tableName = this.getMigrationsTableName();
    const schema = this.getMigrationsSchema();

    if (!schema) {
      return `"${tableName}"`;
    }

    return `"${schema}"."${tableName}"`;
  }

  private getMigrationsTableRegclassName(): string {
    const tableName = this.getMigrationsTableName();
    const schema = this.getMigrationsSchema();

    if (!schema) {
      return tableName;
    }

    return `${schema}.${tableName}`;
  }
}
