import {
  InteractionType,
  SIGNATURE_HEADER,
  signedMessage,
  TIMESTAMP_HEADER,
} from '@vintage/discord-kit';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyGatewayInteraction } from '../src/gateway-auth';

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

const NOW = new Date('2026-11-04T19:30:00Z');
const SECRET = 'gateway-shared-secret';
const ENDPOINT = 'https://vintage.convex.site/gateway/interaction';

let publicKey: string;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  publicKey = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  privateKey = pair.privateKey;

  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  otherPrivateKey = other.privateKey;
});

async function makeRequest(
  rawBody: string,
  opts: {
    secret?: string | null;
    timestamp?: string | null;
    signature?: string | null;
    signer?: CryptoKey;
    tamperBody?: string;
  } = {},
) {
  const timestamp =
    opts.timestamp === undefined ? String(Math.floor(NOW.getTime() / 1000)) : opts.timestamp;
  const signature =
    opts.signature === undefined && timestamp !== null
      ? toHex(
          await crypto.subtle.sign(
            { name: 'Ed25519' },
            opts.signer ?? privateKey,
            signedMessage(timestamp, rawBody),
          ),
        )
      : opts.signature;

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  if (signature !== null && signature !== undefined) headers[SIGNATURE_HEADER] = signature;
  if (timestamp !== null) headers[TIMESTAMP_HEADER] = timestamp;

  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: opts.tamperBody ?? rawBody,
  });
}

describe('verifyGatewayInteraction (#263)', () => {
  const payload = {
    id: 'i1',
    application_id: 'app1',
    token: 'tok',
    type: InteractionType.MESSAGE_COMPONENT,
    guild_id: 'g1',
    member: { user: { id: 'u-officer' } },
    data: { custom_id: 'signup:raid1:accepted', component_type: 2 },
  };

  it('accepts a request with valid bearer secret and valid Discord signature over raw body', async () => {
    const rawBody = `${JSON.stringify(payload, null, 2)}\n`;
    const result = await verifyGatewayInteraction(await makeRequest(rawBody), {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect(result).toEqual({ interaction: payload });
  });

  it('rejects a missing or wrong bearer secret with 401 even when Discord signature is valid', async () => {
    const req = await makeRequest(JSON.stringify(payload), { secret: 'wrong-secret' });
    const res = await verifyGatewayInteraction(req, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it('fails closed with 500 when VINTAGE_GATEWAY_SECRET or DISCORD_PUBLIC_KEY is missing or invalid', async () => {
    const noSecret = await verifyGatewayInteraction(await makeRequest(JSON.stringify(payload)), {
      secret: undefined,
      publicKey,
      now: () => NOW,
    });
    expect((noSecret as Response).status).toBe(500);

    const noKey = await verifyGatewayInteraction(await makeRequest(JSON.stringify(payload)), {
      secret: SECRET,
      publicKey: undefined,
      now: () => NOW,
    });
    expect((noKey as Response).status).toBe(500);
    expect(await (noKey as Response).json()).toEqual({ error: 'DISCORD_PUBLIC_KEY is not set' });

    const badKey = await verifyGatewayInteraction(await makeRequest(JSON.stringify(payload)), {
      secret: SECRET,
      publicKey: 'not-a-valid-hex-key',
      now: () => NOW,
    });
    expect((badKey as Response).status).toBe(500);
    expect(await (badKey as Response).json()).toEqual({ error: 'DISCORD_PUBLIC_KEY is invalid' });
  });

  it('rejects missing signature headers with 401 even with the right bearer secret', async () => {
    const req = await makeRequest(JSON.stringify(payload), { signature: null, timestamp: null });
    const res = await verifyGatewayInteraction(req, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect((res as Response).status).toBe(401);
  });

  it('rejects a tampered body (e.g. forged officer user id) with 401', async () => {
    const raw = JSON.stringify(payload);
    const forged = JSON.stringify({ ...payload, member: { user: { id: 'u-different-officer' } } });
    const req = await makeRequest(raw, { tamperBody: forged });
    const res = await verifyGatewayInteraction(req, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect((res as Response).status).toBe(401);
  });

  it('rejects a signature from a different keypair with 401', async () => {
    const req = await makeRequest(JSON.stringify(payload), { signer: otherPrivateKey });
    const res = await verifyGatewayInteraction(req, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect((res as Response).status).toBe(401);
  });

  it('rejects a replayed timestamp outside the 5-minute window with 401', async () => {
    const stale = await makeRequest(JSON.stringify(payload));
    const later = new Date(NOW.getTime() + 6 * 60 * 1000);
    const res = await verifyGatewayInteraction(stale, {
      secret: SECRET,
      publicKey,
      now: () => later,
    });
    expect((res as Response).status).toBe(401);
  });

  it('verifies the signature before parsing JSON (unsigned bad JSON gets 401, not 400)', async () => {
    const unsignedBadJson = await makeRequest('{not-json', { signature: null });
    const res = await verifyGatewayInteraction(unsignedBadJson, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect((res as Response).status).toBe(401);
  });

  it('returns 400 when a validly signed body is not valid JSON', async () => {
    const signedBadJson = await makeRequest('{not-json');
    const res = await verifyGatewayInteraction(signedBadJson, {
      secret: SECRET,
      publicKey,
      now: () => NOW,
    });
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).json()).toEqual({ error: 'invalid JSON' });
  });
});
