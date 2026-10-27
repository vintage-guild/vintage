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
  const signedAt = new Date(Number(timestamp) * 1000);
  const atSigning = { now: () => signedAt };
  let key: Awaited<ReturnType<typeof keypair>>;
  let signature: string;

  beforeAll(async () => {
    key = await keypair();
    signature = await key.sign(timestamp, body);
  });

  it('accepts a valid signature over timestamp + raw body', async () => {
    expect(await verifyInteraction(key.publicHex, { signature, timestamp, body }, atSigning)).toBe(
      true,
    );
  });

  it('accepts a pre-imported key and a byte body', async () => {
    const imported = await importPublicKey(key.publicHex);
    const bytes = new TextEncoder().encode(body);
    expect(
      await verifyInteraction(imported, { signature, timestamp, body: bytes }, atSigning),
    ).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const tampered = body.replace('i1', 'i2');
    expect(
      await verifyInteraction(key.publicHex, { signature, timestamp, body: tampered }, atSigning),
    ).toBe(false);
  });

  it('rejects a tampered timestamp', async () => {
    expect(
      await verifyInteraction(
        key.publicHex,
        { signature, timestamp: '1761400001', body },
        atSigning,
      ),
    ).toBe(false);
  });

  it('rejects a signature from another key', async () => {
    const other = await keypair();
    expect(
      await verifyInteraction(other.publicHex, { signature, timestamp, body }, atSigning),
    ).toBe(false);
  });

  it('rejects missing or malformed headers without throwing', async () => {
    const pk = key.publicHex;
    expect(await verifyInteraction(pk, { signature: null, timestamp, body }, atSigning)).toBe(
      false,
    );
    expect(await verifyInteraction(pk, { signature, timestamp: undefined, body }, atSigning)).toBe(
      false,
    );
    expect(await verifyInteraction(pk, { signature: 'zz', timestamp, body }, atSigning)).toBe(
      false,
    );
    expect(
      await verifyInteraction(pk, { signature: 'ab'.repeat(32), timestamp, body }, atSigning),
    ).toBe(false);
  });

  it('rejects a malformed public key without throwing', async () => {
    expect(await verifyInteraction('not-hex', { signature, timestamp, body }, atSigning)).toBe(
      false,
    );
  });

  describe('replay window', () => {
    const at = (offsetSeconds: number) => ({
      now: () => new Date(signedAt.getTime() + offsetSeconds * 1000),
    });
    const verifyAt = (offsetSeconds: number) =>
      verifyInteraction(key.publicHex, { signature, timestamp, body }, at(offsetSeconds));

    it('accepts a request signed up to 5 minutes ago or ahead', async () => {
      expect(await verifyAt(300)).toBe(true);
      expect(await verifyAt(-300)).toBe(true);
    });

    it('rejects a correctly signed request replayed more than 5 minutes later', async () => {
      expect(await verifyAt(301)).toBe(false);
      expect(await verifyAt(24 * 60 * 60)).toBe(false);
    });

    it('rejects a timestamp more than 5 minutes in the future', async () => {
      expect(await verifyAt(-301)).toBe(false);
    });

    it('honours a custom window', async () => {
      const opts = { ...at(61), maxAgeSeconds: 60 };
      expect(await verifyInteraction(key.publicHex, { signature, timestamp, body }, opts)).toBe(
        false,
      );
    });

    it('rejects a signed timestamp that is not a whole number of seconds', async () => {
      for (const ts of ['', 'abc', '1761400000.5', '1e9', ' 1761400000', '-1']) {
        const sig = await key.sign(ts, body);
        expect(
          await verifyInteraction(
            key.publicHex,
            { signature: sig, timestamp: ts, body },
            atSigning,
          ),
          ts,
        ).toBe(false);
      }
    });

    it('checks against the real clock by default', async () => {
      const fresh = String(Math.floor(Date.now() / 1000));
      const sig = await key.sign(fresh, body);
      expect(
        await verifyInteraction(key.publicHex, { signature: sig, timestamp: fresh, body }),
      ).toBe(true);
      expect(await verifyInteraction(key.publicHex, { signature, timestamp, body })).toBe(false);
    });
  });
});

describe('hexToBytes', () => {
  it('decodes hex and rejects odd or non-hex input', () => {
    expect([...(hexToBytes('00ff10') ?? [])]).toEqual([0, 255, 16]);
    expect(hexToBytes('abc')).toBeUndefined();
    expect(hexToBytes('zz')).toBeUndefined();
  });
});
