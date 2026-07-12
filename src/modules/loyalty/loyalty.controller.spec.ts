import { Test } from '@nestjs/testing';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyController', () => {
  let controller: LoyaltyController;
  const service = {
    getSummary: jest.fn().mockResolvedValue({ points: 10 }),
    redeem: jest.fn().mockResolvedValue({ points: 0 }),
  };

  beforeEach(async () => {
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
});
