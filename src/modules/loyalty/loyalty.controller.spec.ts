import { Test } from '@nestjs/testing';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyController', () => {
  let controller: LoyaltyController;
  const service = {
    getSummary: jest.fn().mockResolvedValue({ points: 10 }),
    redeem: jest.fn().mockResolvedValue({ points: 0 }),
    getConfig: jest.fn().mockResolvedValue({ id: 'cfg' }),
    updateConfig: jest.fn().mockResolvedValue({ id: 'cfg' }),
    listLevels: jest.fn().mockResolvedValue([]),
    createLevel: jest.fn().mockResolvedValue({ id: 'lvl1' }),
    updateLevel: jest.fn().mockResolvedValue({ id: 'lvl1' }),
    deleteLevel: jest.fn().mockResolvedValue({ message: 'Nivel eliminado' }),
    createReward: jest.fn().mockResolvedValue({ id: 'rw1' }),
    updateReward: jest.fn().mockResolvedValue({ id: 'rw1' }),
    deleteReward: jest
      .fn()
      .mockResolvedValue({ message: 'Recompensa eliminada' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LoyaltyController],
      providers: [{ provide: LoyaltyService, useValue: service }],
    }).compile();
    controller = moduleRef.get(LoyaltyController);
  });

  it('getMe delega con el userId del request', async () => {
    await controller.getMe({ user: { userId: 'u1' } } as never);
    expect(service.getSummary).toHaveBeenCalledWith('u1');
  });

  it('redeem delega con el userId del request y el rewardId', async () => {
    await controller.redeem({ user: { userId: 'u1' } } as never, {
      rewardId: 'rw1',
    });
    expect(service.redeem).toHaveBeenCalledWith('u1', 'rw1');
  });

  it('getConfig delega', async () => {
    await controller.getConfig();
    expect(service.getConfig).toHaveBeenCalled();
  });

  it('updateConfig delega el dto', async () => {
    await controller.updateConfig({ purchasePointsRate: 2 });
    expect(service.updateConfig).toHaveBeenCalledWith({
      purchasePointsRate: 2,
    });
  });

  it('listLevels delega', async () => {
    await controller.listLevels();
    expect(service.listLevels).toHaveBeenCalled();
  });

  it('createLevel delega el dto', async () => {
    await controller.createLevel({ name: 'Oro' });
    expect(service.createLevel).toHaveBeenCalledWith({ name: 'Oro' });
  });

  it('updateLevel delega id y dto', async () => {
    await controller.updateLevel('lvl1', { name: 'Plata' });
    expect(service.updateLevel).toHaveBeenCalledWith('lvl1', { name: 'Plata' });
  });

  it('deleteLevel delega el id', async () => {
    const result = await controller.deleteLevel('lvl1');
    expect(service.deleteLevel).toHaveBeenCalledWith('lvl1');
    expect(result.message).toContain('eliminado');
  });

  it('createReward delega el dto', async () => {
    await controller.createReward({ cost: 100 });
    expect(service.createReward).toHaveBeenCalledWith({ cost: 100 });
  });

  it('updateReward delega id y dto', async () => {
    await controller.updateReward('rw1', { cost: 50 });
    expect(service.updateReward).toHaveBeenCalledWith('rw1', { cost: 50 });
  });

  it('deleteReward delega el id', async () => {
    const result = await controller.deleteReward('rw1');
    expect(service.deleteReward).toHaveBeenCalledWith('rw1');
    expect(result.message).toContain('eliminada');
  });
});
