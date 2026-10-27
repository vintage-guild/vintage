// Sign-in settings fail closed on a hosted deployment (src/auth-env.ts): no public default secret,
// no localhost origin, no empty Discord client.

import { describe, expect, it } from 'vitest';
import { authEnv, authOrigins, isLocalBackend } from '../src/auth-env';

const HOSTED = { CONVEX_SITE_URL: 'https://dusty-sardine-902.convex.site' };
const LOCAL = { CONVEX_SITE_URL: 'http://127.0.0.1:3211' };
const CONFIGURED = {
  ...HOSTED,
  BETTER_AUTH_SECRET: 'a-long-random-secret',
  SITE_URL: 'https://vintageguild.gg',
  DISCORD_CLIENT_ID: '123',
  DISCORD_CLIENT_SECRET: 'shh',
};

describe('authEnv', () => {
  it('returns the settings of a configured hosted deployment', () => {
    const env = authEnv({ ...CONFIGURED, VINTAGE_TRUSTED_ORIGINS: ' https://a.vercel.app ,' });
    expect(env).toEqual({
      secret: 'a-long-random-secret',
      siteUrl: 'https://vintageguild.gg',
      origins: ['https://vintageguild.gg', 'https://a.vercel.app'],
      discordClientId: '123',
      discordClientSecret: 'shh',
    });
  });

  it('refuses a hosted deployment missing any setting, naming each one', () => {
    expect(() => authEnv(HOSTED)).toThrow(
      'set BETTER_AUTH_SECRET, SITE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET',
    );
    expect(() => authEnv({ ...CONFIGURED, BETTER_AUTH_SECRET: '' })).toThrow('BETTER_AUTH_SECRET');
  });

  it('treats a deployment with no site URL as hosted', () => {
    expect(() => authEnv({})).toThrow('Sign-in is not configured');
  });

  it('falls back to development values only on a local backend', () => {
    expect(authEnv(LOCAL)).toEqual({
      secret: undefined,
      siteUrl: 'http://localhost:5173',
      origins: ['http://localhost:5173'],
      discordClientId: '',
      discordClientSecret: '',
    });
  });
});

describe('authOrigins', () => {
  it('trusts no localhost origin on a hosted deployment without SITE_URL', () => {
    expect(authOrigins(HOSTED)).toEqual([]);
    expect(authOrigins({ ...HOSTED, VINTAGE_TRUSTED_ORIGINS: 'https://a.vercel.app' })).toEqual([
      'https://a.vercel.app',
    ]);
  });
});

describe('isLocalBackend', () => {
  it('recognizes loopback only', () => {
    expect(isLocalBackend(LOCAL)).toBe(true);
    expect(isLocalBackend({ CONVEX_SITE_URL: 'http://localhost:3211' })).toBe(true);
    expect(isLocalBackend(HOSTED)).toBe(false);
    expect(isLocalBackend({ CONVEX_SITE_URL: 'http://localhost.evil.example' })).toBe(false);
    expect(isLocalBackend({})).toBe(false);
  });
});
