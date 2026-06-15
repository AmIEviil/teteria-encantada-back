import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('mapea el payload a AuthUser', () => {
    const strategy = new JwtStrategy();
    const result = strategy.validate({
      sub: 'u1',
      username: 'juan',
      email: 'juan@x.com',
      role: 'Admin',
    });
    expect(result).toEqual({
      userId: 'u1',
      username: 'juan',
      email: 'juan@x.com',
      role: 'Admin',
    });
  });

  it('usa null cuando no hay username', () => {
    const strategy = new JwtStrategy();
    const result = strategy.validate({
      sub: 'u1',
      email: 'juan@x.com',
      role: 'Admin',
    });
    expect(result.username).toBeNull();
  });
});
