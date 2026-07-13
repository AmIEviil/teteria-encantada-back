import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  const ORIGINAL = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL,
      GOOGLE_CLIENT_ID: 'cid',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL;
  });

  it('mapea el profile de Google a GoogleProfileResult', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn();
    const profile = {
      id: 'g-123',
      name: { givenName: 'Ana', familyName: 'Lopez' },
      emails: [{ value: 'Ana@Gmail.com' }],
    };

    strategy.validate('at', 'rt', profile as never, done);

    expect(done).toHaveBeenCalledWith(null, {
      googleId: 'g-123',
      email: 'ana@gmail.com',
      firstName: 'Ana',
      lastName: 'Lopez',
    });
  });

  it('falla si no hay email en el profile', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn();
    const profile = { id: 'g-1', name: { givenName: 'X' }, emails: [] };

    strategy.validate('at', 'rt', profile as never, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error), false);
  });

  it('deriva el nombre desde el email cuando Google no lo entrega', () => {
    const strategy = new GoogleStrategy();
    const done = jest.fn();
    const profile = { id: 'g-2', emails: [{ value: 'ana.lopez@gmail.com' }] };

    strategy.validate('at', 'rt', profile as never, done);

    expect(done).toHaveBeenCalledWith(null, {
      googleId: 'g-2',
      email: 'ana.lopez@gmail.com',
      firstName: 'ana.lopez',
      lastName: null,
    });
  });

  it('usa el callbackURL por defecto cuando no hay variable de entorno', () => {
    delete process.env.GOOGLE_CALLBACK_URL;

    const strategy = new GoogleStrategy() as unknown as {
      _callbackURL: string;
    };

    expect(strategy._callbackURL).toBe(
      'http://localhost:3000/api/auth/google/callback',
    );
  });
});
