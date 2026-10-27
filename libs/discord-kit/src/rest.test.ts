import { describe, expect, it } from 'vitest';
import { createDiscordRest, DiscordRestError, type FetchLike, ScheduledEventStatus } from './rest';

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

const json =
  (status: number, body: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe('createDiscordRest', () => {
  it('sends bot auth and JSON', async () => {
    const { fetch, calls } = fakeFetch(json(200, { id: 'm1' }));
    const rest = createDiscordRest({ token: 'test-token', fetch });
    expect(await rest.createMessage('c1', { content: 'hi' })).toEqual({ id: 'm1' });
    const call = calls[0]!;
    expect(call.url).toBe('https://discord.com/api/v10/channels/c1/messages');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bot test-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toMatch(/^DiscordBot \(/);
    expect(JSON.parse(String(call.init.body))).toEqual({ content: 'hi' });
  });

  it('on 429 waits retry_after, retries, then succeeds', async () => {
    const { fetch, calls } = fakeFetch(
      json(429, { message: 'You are being rate limited.', retry_after: 0.25, global: false }),
      json(429, { retry_after: 1.5 }),
      json(200, { ok: true }),
    );
    const { waits, sleep } = recordingSleep();
    const rest = createDiscordRest({ token: 't', fetch, sleep });
    expect(await rest.request('GET', '/users/@me')).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([250, 1500]);
  });

  it('falls back to the Retry-After header', async () => {
    const { fetch } = fakeFetch(
      () => new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      json(200, {}),
    );
    const { waits, sleep } = recordingSleep();
    await createDiscordRest({ token: 't', fetch, sleep }).request('GET', '/x');
    expect(waits).toEqual([2000]);
  });

  it('gives up after maxRetries 429s', async () => {
    const limited = json(429, { retry_after: 0.01 });
    const { fetch, calls } = fakeFetch(limited, limited, limited);
    const { sleep } = recordingSleep();
    const rest = createDiscordRest({ token: 't', fetch, sleep, maxRetries: 2 });
    await expect(rest.request('GET', '/x')).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(3);
  });

  it('fails fast when retry_after exceeds the cap', async () => {
    const { fetch, calls } = fakeFetch(json(429, { retry_after: 120, global: true }));
    const { waits, sleep } = recordingSleep();
    const rest = createDiscordRest({ token: 't', fetch, sleep });
    await expect(rest.request('GET', '/x')).rejects.toBeInstanceOf(DiscordRestError);
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it('surfaces a 5xx as DiscordRestError without retrying', async () => {
    const { fetch, calls } = fakeFetch(json(502, { message: 'Bad Gateway', code: 0 }));
    const rest = createDiscordRest({ token: 't', fetch });
    const err = await rest.request('GET', '/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DiscordRestError);
    expect(err).toMatchObject({ status: 502, method: 'GET', path: '/x', code: 0 });
    expect((err as Error).message).toContain('Bad Gateway');
    expect(calls).toHaveLength(1);
  });

  it('edits the original interaction response via the token, without bot auth', async () => {
    const { fetch, calls } = fakeFetch(json(200, { id: 'm1' }));
    const rest = createDiscordRest({ fetch });
    await rest.editOriginalResponse('app1', 'tok1', { content: 'done' });
    const call = calls[0]!;
    expect(call.url).toBe('https://discord.com/api/v10/webhooks/app1/tok1/messages/@original');
    expect(call.init.method).toBe('PATCH');
    expect((call.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('upserts guild and global commands', async () => {
    const { fetch, calls } = fakeFetch(json(201, {}), json(200, {}));
    const rest = createDiscordRest({ token: 't', fetch });
    const command = { name: 'vintage', description: 'Vintage' };
    await rest.upsertCommand('app1', command, 'g1');
    await rest.upsertCommand('app1', command);
    expect(calls.map((c) => c.url)).toEqual([
      'https://discord.com/api/v10/applications/app1/guilds/g1/commands',
      'https://discord.com/api/v10/applications/app1/commands',
    ]);
  });

  it('creates, edits, and deletes an EXTERNAL scheduled event, retrying a 429', async () => {
    const { fetch, calls } = fakeFetch(
      json(429, { retry_after: 0.5 }),
      json(200, { id: 'ev1' }),
      json(200, { id: 'ev1' }),
      () => new Response(null, { status: 204 }),
    );
    const { waits, sleep } = recordingSleep();
    const rest = createDiscordRest({ token: 't', fetch, sleep });
    const data = {
      name: 'Molten Core',
      scheduled_start_time: '2026-11-01T02:00:00.000Z',
      scheduled_end_time: '2026-11-01T05:00:00.000Z',
      description: 'Sign up',
      entity_metadata: { location: 'Molten Core' },
    };
    expect(await rest.createScheduledEvent('g1', data)).toEqual({ id: 'ev1' });
    await rest.editScheduledEvent('g1', 'ev1', { status: ScheduledEventStatus.CANCELED });
    await rest.deleteScheduledEvent('g1', 'ev1');
    expect(waits).toEqual([500]);
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST https://discord.com/api/v10/guilds/g1/scheduled-events',
      'POST https://discord.com/api/v10/guilds/g1/scheduled-events',
      'PATCH https://discord.com/api/v10/guilds/g1/scheduled-events/ev1',
      'DELETE https://discord.com/api/v10/guilds/g1/scheduled-events/ev1',
    ]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      entity_type: 3,
      privacy_level: 2,
      ...data,
    });
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ status: 4 });
  });

  it('requires a token for bot-auth routes and handles 204', async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(createDiscordRest({ fetch }).request('GET', '/x')).rejects.toThrow(/token/);
    expect(await createDiscordRest({ token: 't', fetch }).request('DELETE', '/x')).toBeUndefined();
  });
});
