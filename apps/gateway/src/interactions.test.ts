import { InteractionType, signedMessage } from '@vintage/discord-kit';
import { beforeAll, describe, expect, it } from 'vitest';
import { createInteractionHandler } from './interactions';

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const NOW = new Date('2026-11-04T19:30:00Z');
const ENDPOINT = 'https://gateway.test/api/discord/interactions';

let publicKey: string;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  publicKey = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  privateKey = pair.privateKey;
});

async function signedRequest(payload: unknown, opts: { tamper?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const signature = toHex(
    await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, signedMessage(timestamp, body)),
  );
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
    // Tampering: send different bytes than were signed (still valid JSON).
    body: opts.tamper ? `${body} ` : body,
  });
}

const handler = () => createInteractionHandler({ publicKey, now: () => NOW });
const base = { id: 'i1', application_id: 'app1', token: 'tok' };

describe('interactions endpoint', () => {
  it('answers PING with PONG', async () => {
    const res = await handler()(await signedRequest({ ...base, type: InteractionType.PING }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ type: 1 });
  });

  it('rejects a bad signature with 401', async () => {
    const res = await handler()(
      await signedRequest({ ...base, type: InteractionType.PING }, { tamper: true }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing signature headers with 401', async () => {
    const res = await handler()(new Request(ENDPOINT, { method: 'POST', body: '{"type":1}' }));
    expect(res.status).toBe(401);
  });

  it('answers /random ping with an immediate reply and a timestamp', async () => {
    const res = await handler()(
      await signedRequest({
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        data: { name: 'random', options: [{ name: 'ping', type: 1 }] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe(4);
    expect(body.data.content).toBe(`pong · <t:${NOW.getTime() / 1000}:F>`);
    expect(body.data.flags).toBe(64);
  });

  it('tells the member privately when a /random subcommand is newer than this gateway', async () => {
    const newer = await signedRequest({
      ...base,
      type: InteractionType.APPLICATION_COMMAND,
      data: { name: 'random', options: [{ name: 'nope', type: 1 }] },
    });
    const res = await handler()(newer);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      type: 4,
      data: { content: expect.stringContaining("can't do that yet"), flags: 64 },
    });
  });

  it('returns 400 for unknown commands and interaction types', async () => {
    // The command was /vintage until the bot became Random; the old name is no longer answered.
    const retired = await signedRequest({
      ...base,
      type: InteractionType.APPLICATION_COMMAND,
      data: { name: 'vintage', options: [{ name: 'ping', type: 1 }] },
    });
    expect((await handler()(retired)).status).toBe(400);
    const unknownType = await signedRequest({
      ...base,
      type: InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE,
    });
    expect((await handler()(unknownType)).status).toBe(400);
  });

  it('returns 405 for non-POST and 500 for a malformed public key', async () => {
    expect((await handler()(new Request(ENDPOINT))).status).toBe(405);
    const broken = createInteractionHandler({ publicKey: 'not-a-key' });
    expect((await broken(await signedRequest({ ...base, type: 1 }))).status).toBe(500);
  });

  describe('signup buttons and modals', () => {
    const click = {
      ...base,
      type: InteractionType.MESSAGE_COMPONENT,
      guild_id: 'g1',
      data: { custom_id: 'signup:raid1:accepted', component_type: 2 },
    };
    const convexReply = { type: 4, data: { content: 'Aeryn: accepted', flags: 64 } };

    it('forwards to the Convex route with the shared secret and returns its response', async () => {
      const calls: { url: string; init: RequestInit }[] = [];
      const fakeFetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(convexReply), { status: 200 });
      }) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        now: () => NOW,
        convex: { siteUrl: 'https://vintage.convex.site/', secret: 's3cret', fetch: fakeFetch },
      });
      const res = await handle(await signedRequest(click));
      expect(await res.json()).toEqual(convexReply);
      expect(calls[0]!.url).toBe('https://vintage.convex.site/gateway/interaction');
      expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
        'Bearer s3cret',
      );
      expect(JSON.parse(calls[0]!.init.body as string)).toEqual(click);
    });

    it('answers privately when Convex is down or not configured', async () => {
      const down = (async () => new Response('boom', { status: 500 })) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        now: () => NOW,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: down },
      });
      expect(await (await handle(await signedRequest(click))).json()).toMatchObject({
        type: 4,
        data: { flags: 64, content: expect.stringMatching(/could not reach/) },
      });
      expect(await (await handler()(await signedRequest(click))).json()).toMatchObject({
        data: { content: expect.stringMatching(/not set up/) },
      });
    });

    it('tells the member privately when Convex does not know the interaction yet', async () => {
      const notOurs = (async () => new Response('{}', { status: 404 })) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: notOurs },
      });
      const res = await handle(await signedRequest(click));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        data: { content: expect.stringContaining("can't do that yet"), flags: 64 },
      });
    });
  });

  describe('/random poll', () => {
    const pollCreate = {
      ...base,
      type: InteractionType.APPLICATION_COMMAND,
      guild_id: 'g1',
      data: {
        name: 'random',
        options: [
          {
            name: 'poll',
            type: 2,
            options: [
              {
                name: 'create',
                type: 1,
                options: [
                  { name: 'question', type: 3, value: 'Which night?' },
                  { name: 'options', type: 3, value: 'Tue; Thu' },
                ],
              },
            ],
          },
        ],
      },
    };

    it('forwards the poll group to Convex and returns its reply', async () => {
      const bodies: unknown[] = [];
      const fakeFetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ type: 4, data: { content: 'posted', flags: 64 } }));
      }) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: fakeFetch },
      });
      const res = await handle(await signedRequest(pollCreate));
      expect(await res.json()).toMatchObject({ data: { content: 'posted' } });
      expect(bodies).toEqual([pollCreate]);
    });

    it('forwards the raid group to Convex', async () => {
      const raidCreate = {
        ...pollCreate,
        data: {
          name: 'random',
          options: [
            {
              name: 'raid',
              type: 2,
              options: [
                {
                  name: 'create',
                  type: 1,
                  options: [{ name: 'start', type: 3, value: '2026-11-10 20:00' }],
                },
              ],
            },
          ],
        },
      };
      const bodies: unknown[] = [];
      const fakeFetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ type: 4, data: { content: 'made', flags: 64 } }));
      }) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: fakeFetch },
      });
      const res = await handle(await signedRequest(raidCreate));
      expect(await res.json()).toMatchObject({ data: { content: 'made' } });
      expect(bodies).toEqual([raidCreate]);
    });

    it('forwards /random help to Convex, so the page fits the reader’s rank', async () => {
      const help = {
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        guild_id: 'g1',
        data: {
          name: 'random',
          options: [
            { name: 'help', type: 1, options: [{ name: 'topic', type: 3, value: 'polls' }] },
          ],
        },
      };
      const bodies: unknown[] = [];
      const fakeFetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ type: 4, data: { content: 'help', flags: 64 } }));
      }) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: fakeFetch },
      });
      const res = await handle(await signedRequest(help));
      expect(await res.json()).toMatchObject({ data: { content: 'help' } });
      expect(bodies).toEqual([help]);
    });

    it('forwards /random ask to Convex and returns its deferred reply', async () => {
      const ask = {
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        guild_id: 'g1',
        data: {
          name: 'random',
          options: [
            {
              name: 'ask',
              type: 1,
              options: [{ name: 'question', type: 3, value: 'When is the next raid?' }],
            },
          ],
        },
      };
      const bodies: unknown[] = [];
      const fakeFetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }));
      }) as typeof fetch;
      const handle = createInteractionHandler({
        publicKey,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: fakeFetch },
      });
      const res = await handle(await signedRequest(ask));
      expect(await res.json()).toEqual({ type: 5, data: { flags: 64 } });
      expect(bodies).toEqual([ask]);
    });

    it('keeps /random ping local', async () => {
      const calls: unknown[] = [];
      const fakeFetch = (async () => {
        calls.push(1);
        return new Response('{}');
      }) as typeof fetch;
      const ping = {
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        data: { name: 'random', options: [{ name: 'ping', type: 1 }] },
      };
      const handle = createInteractionHandler({
        publicKey,
        now: () => NOW,
        convex: { siteUrl: 'https://x.convex.site', secret: 's', fetch: fakeFetch },
      });
      await handle(await signedRequest(ping));
      expect(calls).toEqual([]);
    });
  });
});
