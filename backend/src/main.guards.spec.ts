// backend/src/main.guards.spec.ts
import { assertRequiredEnv } from './main.guards';

describe('assertRequiredEnv', () => {
  it('throws if JWT_SECRET is unset', () => {
    expect(() => assertRequiredEnv({} as any)).toThrow(/JWT_SECRET/);
  });

  it('throws if JWT_SECRET is empty string', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: '' } as any),
    ).toThrow(/JWT_SECRET/);
  });

  it('passes if JWT_SECRET is set to a non-empty value', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: 'something' } as any),
    ).not.toThrow();
  });
});
