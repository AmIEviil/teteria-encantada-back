import { EventPurchase, EventPurchaseStatus } from './event-purchase.entity';

it('EventPurchase se instancia con estado PENDING por defecto en el enum', () => {
  const p = new EventPurchase();
  p.status = EventPurchaseStatus.PENDING;
  expect(EventPurchaseStatus.PAID).toBe('PAID');
  expect(EventPurchaseStatus.REJECTED).toBe('REJECTED');
  expect(p.status).toBe('PENDING');
});
