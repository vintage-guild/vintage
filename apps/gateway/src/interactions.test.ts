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

  it('answers /vintage ping with an immediate reply and a timestamp', async () => {
    const res = await handler()(
      await signedRequest({
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        data: { name: 'vintage', options: [{ name: 'ping', type: 1 }] },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe(4);
    expect(body.data.content).toBe(`pong · <t:${NOW.getTime() / 1000}:F>`);
    expect(body.data.flags).toBe(64);
  });

  it('returns 400 for unknown commands and interaction types', async () => {
    const unknownCommand = await signedRequest({
      ...base,
      type: InteractionType.APPLICATION_COMMAND,
      data: { name: 'vintage', options: [{ name: 'nope', type: 1 }] },
    });
    expect((await handler()(unknownCommand)).status).toBe(400);
    const unknownType = await signedRequest({ ...base, type: InteractionType.MODAL_SUBMIT });
    expect((await handler()(unknownType)).status).toBe(400);
  });

  it('returns 405 for non-POST and 500 for a malformed public key', async () => {
    expect((await handler()(new Request(ENDPOINT))).status).toBe(405);
    const broken = createInteractionHandler({ publicKey: 'not-a-key' });
    expect((await broken(await signedRequest({ ...base, type: 1 }))).status).toBe(500);
  });
});
