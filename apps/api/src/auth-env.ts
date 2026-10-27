// The sign-in settings from the Convex environment (convex/auth.ts). On a hosted deployment a
// missing value is an error: Better Auth would otherwise sign sessions with its public default
// secret, trust localhost, or call Discord with an empty client id. Only a local backend
// (dev:local, cloud sessions) falls back to development values.

type Env = Record<string, string | undefined>;

export interface AuthEnv {
  /** Signs sessions; undefined only on a local backend, where Better Auth uses its dev secret. */
  secret: string | undefined;
  /** The website origin sign-in returns to. */
  siteUrl: string;
  /** SITE_URL plus VINTAGE_TRUSTED_ORIGINS. */
  origins: string[];
  discordClientId: string;
  discordClientSecret: string;
}

const LOCAL_SITE_URL = 'http://localhost:5173';
const REQUIRED = ['BETTER_AUTH_SECRET', 'SITE_URL', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];

/** Whether this is a local Convex backend, which serves its HTTP routes on loopback. */
export function isLocalBackend(env: Env): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(env.CONVEX_SITE_URL ?? '');
}

/** The website origins allowed to sign in. Empty on a hosted deployment without SITE_URL. */
export function authOrigins(env: Env): string[] {
  const site = env.SITE_URL || (isLocalBackend(env) ? LOCAL_SITE_URL : undefined);
  const more = (env.VINTAGE_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return site ? [site, ...more] : more;
}

/** Every sign-in setting, or an error naming the ones a hosted deployment is missing. */
export function authEnv(env: Env): AuthEnv {
  if (!isLocalBackend(env)) {
    const missing = REQUIRED.filter((name) => !env[name]);
    if (missing.length)
      throw new Error(`Sign-in is not configured: set ${missing.join(', ')} in the Convex env`);
  }
  return {
    secret: env.BETTER_AUTH_SECRET || undefined,
    siteUrl: env.SITE_URL || LOCAL_SITE_URL,
    origins: authOrigins(env),
    discordClientId: env.DISCORD_CLIENT_ID ?? '',
    discordClientSecret: env.DISCORD_CLIENT_SECRET ?? '',
  };
}
