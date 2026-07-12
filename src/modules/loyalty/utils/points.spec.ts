import { purchasePoints, resolveLevelId } from './points';

describe('purchasePoints', () => {
  it('floors total * rate', () => {
    expect(purchasePoints(10000, 0.01)).toBe(100);
    expect(purchasePoints(9999, 0.01)).toBe(99);
  });
  it('never negative', () => {
    expect(purchasePoints(-5, 0.01)).toBe(0);
  });
});

describe('resolveLevelId', () => {
  const levels = [
    { id: 'a', threshold: 0 },
    { id: 'b', threshold: 100 },
    { id: 'c', threshold: 500 },
  ];
  it('picks highest threshold <= points', () => {
    expect(resolveLevelId(0, levels)).toBe('a');
    expect(resolveLevelId(250, levels)).toBe('b');
    expect(resolveLevelId(500, levels)).toBe('c');
  });
  it('null when no level applies', () => {
    expect(resolveLevelId(0, [{ id: 'x', threshold: 50 }])).toBeNull();
  });
});
