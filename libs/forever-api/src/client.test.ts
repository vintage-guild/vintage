import { describe, expect, it } from 'vitest';
import {
  characterSlug,
  createForeverApi,
  type FetchLike,
  ForeverApiError,
  guildSlug,
  parseRegion,
} from './client';

interface Call {
  url: string;
  init: RequestInit;
}

/** A fake fetch that replays `responses` in order and records each call. */
function fakeFetch(...responses: Array<() => Response>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected call ${calls.length}: ${url}`);
    return next();
  };
  return { fetch, calls };
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const tokenOk = json(200, { access_token: 'tok-1', token_type: 'bearer', expires_in: 86399 });

/** Trimmed from a live US response (forum post 60334, Nov 2026), plus fields Retail sends. */
const PROFILE = {
  _links: { self: { href: 'https://us.api.blizzard.com/profile/wow/character/judgement-judy' } },
  id: 3889172,
  name: 'Judgement',
  surname: 'Judy',
  ruleset: { key: { href: '…' }, name: 'Normal', id: 1 },
  gender: { type: 'FEMALE', name: 'Female' },
  faction: { type: 'ALLIANCE', name: 'Alliance' },
  race: { id: 1, name: 'Human' },
  character_class: { id: 2, name: 'Paladin' },
  guild: { name: 'Vintage', id: 99, slug: 'vintage', faction: { type: 'ALLIANCE' } },
  level: 41,
  experience: 1200,
  equipped_item_level: 38,
  average_item_level: 39,
  last_login_timestamp: 1_794_000_000_000,
};

const api = (fetch: FetchLike, now = () => 0) =>
  createForeverApi({ region: 'us', clientId: 'id', clientSecret: 'secret', fetch, now });

describe('slugs', () => {
  it('builds a character slug from name and surname, lowercased', () => {
    expect(characterSlug('Judgement', 'Judy')).toBe('judgement-judy');
    expect(characterSlug(' Ærin ', 'Stormwind')).toBe('ærin-stormwind');
  });

  it('builds a guild slug the way Blizzard does', () => {
    expect(guildSlug('Vintage')).toBe('vintage');
    expect(guildSlug("Knights of the Silver Hand's Rest")).toBe('knights-of-the-silver-hands-rest');
  });

  it('reads a region from config text', () => {
    expect(parseRegion(' EU ')).toBe('eu');
    expect(parseRegion('cn')).toBeNull();
    expect(parseRegion(undefined)).toBeNull();
  });
});

describe('createForeverApi', () => {
  it('takes a client-credentials token, then reads the profile in the Forever namespace', async () => {
    const { fetch, calls } = fakeFetch(tokenOk, json(200, PROFILE));
    const profile = await api(fetch).characterProfile('Judgement', 'Judy');
    expect(profile).toMatchObject({
      id: 3889172,
      name: 'Judgement',
      surname: 'Judy',
      level: 41,
      character_class: { id: 2, name: 'Paladin' },
      guild: { name: 'Vintage', slug: 'vintage' },
      equipped_item_level: 38,
    });
    // Fields Vintage doesn't read are dropped, not kept.
    expect(profile).not.toHaveProperty('experience');

    const [tokenCall, profileCall] = calls;
    expect(tokenCall!.url).toBe('https://oauth.battle.net/token');
    expect(tokenCall!.init.method).toBe('POST');
    expect(tokenCall!.init.body).toBe('grant_type=client_credentials');
    expect((tokenCall!.init.headers as Record<string, string>).authorization).toBe(
      `Basic ${btoa('id:secret')}`,
    );
    expect(profileCall!.url).toBe(
      'https://us.api.blizzard.com/profile/wow/character/judgement-judy?namespace=profile-forever-us&locale=en_US',
    );
    expect((profileCall!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer tok-1',
    );
  });

  it('keeps the token until a minute before it expires', async () => {
    let at = 0;
    const { fetch, calls } = fakeFetch(
      tokenOk,
      json(200, PROFILE),
      json(200, PROFILE),
      json(200, { access_token: 'tok-2', expires_in: 86399 }),
      json(200, PROFILE),
    );
    const client = api(fetch, () => at);
    await client.characterProfile('Judgement', 'Judy');
    at = 86_000_000;
    await client.characterProfile('Judgement', 'Judy');
    at = 86_399_000 - 60_000 + 1;
    await client.characterProfile('Judgement', 'Judy');
    expect(calls.map((c) => c.url.split('?')[0]!.split('/').pop())).toEqual([
      'token',
      'judgement-judy',
      'judgement-judy',
      'token',
      'judgement-judy',
    ]);
  });

  it('takes a new token once when Blizzard answers 401', async () => {
    const { fetch, calls } = fakeFetch(
      tokenOk,
      json(401, {}),
      json(200, { access_token: 'tok-2', expires_in: 86399 }),
      json(200, PROFILE),
    );
    expect(await api(fetch).characterProfile('Judgement', 'Judy')).toMatchObject({ id: 3889172 });
    expect((calls[3]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok-2');
  });

  it('answers null for a character the armory does not have', async () => {
    const { fetch } = fakeFetch(tokenOk, json(404, { code: 404, type: 'BLZWEBAPI00000404' }));
    expect(await api(fetch).characterProfile('Nobody', 'Here')).toBeNull();
  });

  it('reads equipment, media, and a guild roster', async () => {
    const { fetch, calls } = fakeFetch(
      tokenOk,
      json(200, {
        character: { name: 'Judgement', surname: 'Judy', id: 3889172 },
        equipped_items: [
          {
            item: { id: 2017, key: { href: '…' } },
            slot: { type: 'HEAD', name: 'Head' },
            quality: { type: 'RARE', name: 'Rare' },
            name: 'Glowing Leather Bracers',
            level: { value: 38, display_string: 'Item Level 38' },
            stats: [],
          },
        ],
      }),
      json(200, { assets: [{ key: 'avatar', value: 'https://render.worldofwarcraft.com/a.jpg' }] }),
      json(200, {
        guild: { name: 'Vintage', slug: 'vintage', id: 99 },
        members: [
          {
            character: {
              name: 'Judgement',
              surname: 'Judy',
              id: 3889172,
              level: 41,
              playable_class: { id: 2 },
              playable_race: { id: 1 },
            },
            rank: 0,
          },
        ],
      }),
    );
    const client = api(fetch);
    const equipment = await client.characterEquipment('Judgement', 'Judy');
    expect(equipment?.equipped_items[0]).toMatchObject({
      item: { id: 2017 },
      slot: { type: 'HEAD' },
      level: { value: 38 },
    });
    expect((await client.characterMedia('Judgement', 'Judy'))?.assets[0]?.key).toBe('avatar');
    const roster = await client.guildRoster('vintage');
    expect(roster?.members[0]).toMatchObject({ character: { surname: 'Judy' }, rank: 0 });
    expect(calls.slice(1).map((c) => new URL(c.url).pathname)).toEqual([
      '/profile/wow/character/judgement-judy/equipment',
      '/profile/wow/character/judgement-judy/character-media',
      '/data/wow/guild/vintage/roster',
    ]);
  });

  it('refuses a body that no longer has the shape Vintage reads', async () => {
    const { fetch } = fakeFetch(tokenOk, json(200, { ...PROFILE, level: 'forty-one' }));
    const err = await api(fetch)
      .characterProfile('Judgement', 'Judy')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForeverApiError);
    expect(err).toMatchObject({ kind: 'shape', retryable: false });
    expect((err as Error).message).toContain('level');
  });

  it('says a 429 or 5xx may work later and a 403 will not', async () => {
    const busy = await api(fakeFetch(tokenOk, json(429, {})).fetch)
      .characterProfile('A', 'B')
      .then(
        () => {
          throw new Error('expected a failure');
        },
        (e: ForeverApiError) => e,
      );
    expect(busy).toMatchObject({ kind: 'http', status: 429, retryable: true });

    const down = await api(fakeFetch(tokenOk, json(503, {})).fetch)
      .characterProfile('A', 'B')
      .then(
        () => {
          throw new Error('expected a failure');
        },
        (e: ForeverApiError) => e,
      );
    expect(down).toMatchObject({ status: 503, retryable: true });

    const denied = await api(fakeFetch(tokenOk, json(403, {})).fetch)
      .characterProfile('A', 'B')
      .then(
        () => {
          throw new Error('expected a failure');
        },
        (e: ForeverApiError) => e,
      );
    expect(denied).toMatchObject({ kind: 'auth', status: 403, retryable: false });
  });

  it('reports bad credentials and dropped connections', async () => {
    const bad = await api(fakeFetch(json(401, { error: 'invalid_client' })).fetch)
      .characterProfile('A', 'B')
      .then(
        () => {
          throw new Error('expected a failure');
        },
        (e: ForeverApiError) => e,
      );
    expect(bad).toMatchObject({ kind: 'auth', path: '/token', retryable: false });
    // The secret never reaches the message.
    expect(bad.message).not.toContain('secret');

    const offline: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    const dropped = await api(offline)
      .characterProfile('A', 'B')
      .then(
        () => {
          throw new Error('expected a failure');
        },
        (e: ForeverApiError) => e,
      );
    expect(dropped).toMatchObject({ kind: 'network', retryable: true });
  });
});
