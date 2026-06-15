import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLayoutDto } from './create-layout.dto';
import { UpdateLayoutDto } from './update-layout.dto';
import { CreateTableDto } from './create-table.dto';
import { UpdateTableDto } from './update-table.dto';
import { SaveLayoutSnapshotDto } from './save-layout-snapshot.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Layout DTOs', () => {
  it('CreateLayoutDto valido', async () => {
    const dto = plainToInstance(CreateLayoutDto, {
      name: 'L',
      description: 'd',
      isActive: true,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateLayoutDto parcial', async () => {
    const dto = plainToInstance(UpdateLayoutDto, { name: 'N' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateTableDto valido', async () => {
    const dto = plainToInstance(CreateTableDto, {
      layoutId: uuid,
      code: 'T1',
      label: 'Mesa',
      capacity: 4,
      positionX: 1,
      positionY: 2,
      width: 100,
      height: 100,
      rotation: 0,
      status: 'AVAILABLE',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateTableDto rechaza sin layoutId', async () => {
    const dto = plainToInstance(CreateTableDto, {
      code: 'T1',
      positionX: 1,
      positionY: 2,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateTableDto parcial', async () => {
    const dto = plainToInstance(UpdateTableDto, {
      label: 'X',
      positionX: 5,
      status: 'RESERVED',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('UpdateTableDto payload completo', async () => {
    const dto = plainToInstance(UpdateTableDto, {
      layoutId: uuid,
      code: 'T1',
      label: 'X',
      capacity: 4,
      positionX: 1,
      positionY: 2,
      width: 100,
      height: 100,
      rotation: 0,
      status: 'AVAILABLE',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('SaveLayoutSnapshotDto valido', async () => {
    const dto = plainToInstance(SaveLayoutSnapshotDto, {
      name: 'Snap',
      isActive: true,
      gridSize: { rows: 5, cols: 5 },
      chairs: [{ id: 'c1', position: { x: 1, y: 2 }, rotation: 0 }],
      tables: [
        {
          id: 't1',
          code: 'T1',
          label: 'Mesa',
          capacity: 4,
          positionX: 1,
          positionY: 2,
          width: 100,
          height: 100,
          rotation: 0,
          status: 'AVAILABLE',
        },
      ],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('SaveLayoutSnapshotDto rechaza sin tables', async () => {
    const dto = plainToInstance(SaveLayoutSnapshotDto, {
      name: 'Snap',
      gridSize: { rows: 5, cols: 5 },
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
