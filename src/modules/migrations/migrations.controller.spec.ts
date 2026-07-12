import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MigrationsController } from './migrations.controller';
import { MigrationService } from './migrations.service';
import { MigrationActionDto } from './dto/migration-action.dto';

describe('MigrationsController', () => {
  let controller: MigrationsController;
  const service = {
    getMigrationsStatus: jest.fn().mockResolvedValue({}),
    getMigrationHistory: jest.fn().mockResolvedValue([]),
    executeMigration: jest.fn().mockResolvedValue({ success: true }),
    revertMigration: jest.fn().mockResolvedValue({ success: true }),
    executeAllPendingMigrations: jest.fn().mockResolvedValue({ success: true }),
    revertLastMigration: jest.fn().mockResolvedValue({ success: true }),
  };
  const req = { user: { userId: 'u1' } } as never;

  beforeEach(async () => {
    jest.clearAllMocks();
    const ref = await Test.createTestingModule({
      controllers: [MigrationsController],
      providers: [{ provide: MigrationService, useValue: service }],
    }).compile();
    controller = ref.get(MigrationsController);
  });

  it('getMigrationsStatus normaliza order desc', async () => {
    await controller.getMigrationsStatus('desc');
    expect(service.getMigrationsStatus).toHaveBeenCalledWith('desc');
  });

  it('getMigrationsStatus default asc', async () => {
    await controller.getMigrationsStatus();
    expect(service.getMigrationsStatus).toHaveBeenCalledWith('asc');
  });

  it('getMigrationHistory', async () => {
    await controller.getMigrationHistory('Mig1');
    expect(service.getMigrationHistory).toHaveBeenCalledWith('Mig1');
  });

  it('executeMigration pasa userId', async () => {
    await controller.executeMigration({ migrationName: 'Mig1' }, req);
    expect(service.executeMigration).toHaveBeenCalledWith('Mig1', 'u1');
  });

  it('revertMigration pasa userId', async () => {
    await controller.revertMigration({ migrationName: 'Mig1' }, req);
    expect(service.revertMigration).toHaveBeenCalledWith('Mig1', 'u1');
  });

  it('executeAllPendingMigrations', async () => {
    await controller.executeAllPendingMigrations();
    expect(service.executeAllPendingMigrations).toHaveBeenCalled();
  });

  it('revertLastMigration', async () => {
    await controller.revertLastMigration();
    expect(service.revertLastMigration).toHaveBeenCalled();
  });
});

describe('MigrationActionDto', () => {
  it('valido', async () => {
    const dto = plainToInstance(MigrationActionDto, { migrationName: 'Mig1' });
    expect(await validate(dto)).toHaveLength(0);
  });
  it('rechaza vacio', async () => {
    const dto = plainToInstance(MigrationActionDto, { migrationName: '' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
