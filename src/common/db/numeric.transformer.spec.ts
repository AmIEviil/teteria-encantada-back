import { numericTransformer } from './numeric.transformer';

describe('numericTransformer', () => {
  it('to devuelve el valor tal cual', () => {
    expect(numericTransformer.to(10)).toBe(10);
    expect(numericTransformer.to(null)).toBeNull();
  });

  it('from convierte string a numero', () => {
    expect(numericTransformer.from('10.50')).toBe(10.5);
  });

  it('from devuelve null cuando es null', () => {
    expect(numericTransformer.from(null)).toBeNull();
  });
});
