// A small client for the WoW: Forever profile API. `fetch` is injected so it runs anywhere
// (Convex actions, scripts, tests) and tests never touch Blizzard. It takes a client-credentials
// token and keeps it until a minute before it expires (or a 401 says it's gone), sends the
// region's namespace and locale, answers null for a 404, checks every body with Zod, and turns
// everything else into a ForeverApiError that says whether a retry could help.
import type { z } from 'zod';
import {
  type CharacterEquipment,
  type CharacterMedia,
  type CharacterProfile,
  characterEquipmentSchema,
  characterMediaSchema,
  characterProfileSchema,
  type GuildRoster,
  guildRosterSchema,
  tokenSchema,
} from './schemas';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Battle.net regions with Forever (CN runs its own API and isn't covered). */
export const FOREVER_REGIONS = ['us', 'eu', 'kr', 'tw'] as const;
export type ForeverRegion = (typeof FOREVER_REGIONS)[number];

const LOCALES: Record<ForeverRegion, string> = {
  us: 'en_US',
  eu: 'en_GB',
  kr: 'ko_KR',
  tw: 'zh_TW',
};

export const OAUTH_TOKEN_URL = 'https://oauth.battle.net/token';
export const apiBase = (region: ForeverRegion) => `https://${region}.api.blizzard.com`;
/** Character and guild data. Forever has no realms, so this is the only profile namespace. */
export const profileNamespace = (region: ForeverRegion) => `profile-forever-${region}`;

export interface ForeverApiOptions {
  region: ForeverRegion;
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  /** Epoch ms, for token expiry. Default `Date.now`. */
  now?: () => number;
}

export type ForeverApiErrorKind = 'http' | 'network' | 'shape' | 'auth';

export class ForeverApiError extends Error {
  constructor(
    readonly kind: ForeverApiErrorKind,
    readonly path: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ForeverApiError';
  }

  /** A 429, a 5xx, or a dropped connection may work later; a bad shape or a 4xx won't. */
  get retryable(): boolean {
    if (this.kind === 'network') return true;
    return this.status !== null && (this.status === 429 || this.status >= 500);
  }
}

/**
 * Forever's character slug: `{name}-{surname}`, lowercased (`judgement-judy`). Name and surname
 * together are unique in a region; the name alone isn't.
 */
export const characterSlug = (name: string, surname: string) =>
  `${name.trim()}-${surname.trim()}`.toLocaleLowerCase('en-US');

/** A guild's slug the way Blizzard builds them: lowercase, spaces to hyphens, no apostrophes. */
export const guildSlug = (name: string) =>
  name.trim().toLocaleLowerCase('en-US').replace(/['’]/g, '').replace(/\s+/g, '-');

export interface ForeverApi {
  readonly region: ForeverRegion;
  characterProfile(name: string, surname: string): Promise<CharacterProfile | null>;
  characterEquipment(name: string, surname: string): Promise<CharacterEquipment | null>;
  characterMedia(name: string, surname: string): Promise<CharacterMedia | null>;
  guildRoster(slug: string): Promise<GuildRoster | null>;
}

const EXPIRY_MARGIN_MS = 60_000;

export function createForeverApi(options: ForeverApiOptions): ForeverApi {
  const { region, clientId, clientSecret } = options;
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  async function send(url: string, init: RequestInit, path: string): Promise<Response> {
    try {
      return await doFetch(url, init);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ForeverApiError('network', path, null, `Blizzard ${path}: ${reason}`);
    }
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > now()) return token.value;
    const path = '/token';
    const res = await send(
      OAUTH_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
      path,
    );
    if (!res.ok) {
      const kind = res.status === 401 || res.status === 400 ? 'auth' : 'http';
      throw new ForeverApiError(kind, path, res.status, `Blizzard token request: ${res.status}`);
    }
    const parsed = tokenSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new ForeverApiError('shape', path, res.status, 'Blizzard token response had no token');
    }
    const { access_token, expires_in } = parsed.data;
    token = { value: access_token, expiresAt: now() + expires_in * 1000 - EXPIRY_MARGIN_MS };
    return access_token;
  }

  async function get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
    const query = new URLSearchParams({
      namespace: profileNamespace(region),
      locale: LOCALES[region],
    });
    const url = `${apiBase(region)}${path}?${query}`;
    const call = async () =>
      send(url, { headers: { authorization: `Bearer ${await accessToken()}` } }, path);
    let res = await call();
    if (res.status === 401) {
      // A token Blizzard revoked early: take a new one, once.
      token = null;
      res = await call();
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      const kind = res.status === 401 || res.status === 403 ? 'auth' : 'http';
      throw new ForeverApiError(kind, path, res.status, `Blizzard ${path}: ${res.status}`);
    }
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.join('.') || 'body';
      throw new ForeverApiError(
        'shape',
        path,
        res.status,
        `Blizzard ${path}: unexpected response at ${where}`,
      );
    }
    return parsed.data;
  }

  const character = (name: string, surname: string, suffix = '') =>
    `/profile/wow/character/${encodeURIComponent(characterSlug(name, surname))}${suffix}`;

  return {
    region,
    characterProfile: (name, surname) => get(character(name, surname), characterProfileSchema),
    characterEquipment: (name, surname) =>
      get(character(name, surname, '/equipment'), characterEquipmentSchema),
    characterMedia: (name, surname) =>
      get(character(name, surname, '/character-media'), characterMediaSchema),
    guildRoster: (slug) =>
      get(`/data/wow/guild/${encodeURIComponent(slug)}/roster`, guildRosterSchema),
  };
}

/** A region from config text, or null when it isn't one Forever runs in. */
export const parseRegion = (value: string | undefined): ForeverRegion | null => {
  const region = value?.trim().toLowerCase();
  return FOREVER_REGIONS.find((r) => r === region) ?? null;
};
