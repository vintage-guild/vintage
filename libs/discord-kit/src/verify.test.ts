import { beforeAll, describe, expect, it } from 'vitest';
import { hexToBytes, importPublicKey, signedMessage, verifyInteraction } from './verify';

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function keypair() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publicHex = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const sign = async (timestamp: string, body: string) =>
    toHex(
      await crypto.subtle.sign(
        { name: 'Ed25519' },
        pair.privateKey,
        signedMessage(timestamp, body),
      ),
    );
  return { publicHex, sign };
}

describe('verifyInteraction', () => {
  const body = JSON.stringify({ type: 1, id: 'i1' });
  const timestamp = '1761400000';
  let key: Awaited<ReturnType<typeof keypair>>;
  let signature: string;

  beforeAll(async () => {
    key = await keypair();
    signature = await key.sign(timestamp, body);
  });

  it('accepts a valid signature over timestamp + raw body', async () => {
    expect(await verifyInteraction(key.publicHex, { signature, timestamp, body })).toBe(true);
  });

  it('accepts a pre-imported key and a byte body', async () => {
    const imported = await importPublicKey(key.publicHex);
    const bytes = new TextEncoder().encode(body);
    expect(await verifyInteraction(imported, { signature, timestamp, body: bytes })).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const tampered = body.replace('i1', 'i2');
    expect(await verifyInteraction(key.publicHex, { signature, timestamp, body: tampered })).toBe(
      false,
    );
  });

  it('rejects a tampered timestamp', async () => {
    expect(
      await verifyInteraction(key.publicHex, { signature, timestamp: '1761400001', body }),
    ).toBe(false);
  });

  it('rejects a signature from another key', async () => {
    const other = await keypair();
    expect(await verifyInteraction(other.publicHex, { signature, timestamp, body })).toBe(false);
  });

  it('rejects missing or malformed headers without throwing', async () => {
    const pk = key.publicHex;
    expect(await verifyInteraction(pk, { signature: null, timestamp, body })).toBe(false);
    expect(await verifyInteraction(pk, { signature, timestamp: undefined, body })).toBe(false);
    expect(await verifyInteraction(pk, { signature: 'zz', timestamp, body })).toBe(false);
    expect(await verifyInteraction(pk, { signature: 'ab'.repeat(32), timestamp, body })).toBe(
      false,
    );
  });

  it('rejects a malformed public key without throwing', async () => {
    expect(await verifyInteraction('not-hex', { signature, timestamp, body })).toBe(false);
  });
});

describe('hexToBytes', () => {
  it('decodes hex and rejects odd or non-hex input', () => {
    expect([...(hexToBytes('00ff10') ?? [])]).toEqual([0, 255, 16]);
    expect(hexToBytes('abc')).toBeUndefined();
    expect(hexToBytes('zz')).toBeUndefined();
  });
});
