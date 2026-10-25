/**
 * Short-lived signed confirmation tokens for destructive commands (PLAN §3.7).
 * A dryRun preview returns a token bound to the command, its exact input, and the caller;
 * the real call must present it before it expires. Stateless: works on every surface.
 */
const encoder = new TextEncoder();

export interface ConfirmClaims {
  command: string;
  inputHash: string;
  subject: string;
  expiresAt: number;
}

export const CONFIRM_TTL_MS = 5 * 60 * 1000;

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of array) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  return atob(text.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Stable JSON: sorted keys, so the same input always hashes the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(text: string): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function hashInput(input: unknown): Promise<string> {
  return sha256(stableStringify(input));
}

export async function issueConfirmToken(
  secret: string,
  claims: Omit<ConfirmClaims, 'expiresAt'>,
  now: number,
): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ ...claims, expiresAt: now + CONFIRM_TTL_MS })),
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

export type ConfirmCheck =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'mismatch' };

export async function verifyConfirmToken(
  secret: string,
  token: string,
  expected: Omit<ConfirmClaims, 'expiresAt'>,
  now: number,
): Promise<ConfirmCheck> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return { ok: false, reason: 'malformed' };
  if ((await hmac(secret, payload)) !== signature) return { ok: false, reason: 'bad-signature' };
  let claims: ConfirmClaims;
  try {
    claims = JSON.parse(fromBase64Url(payload));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.expiresAt < now) return { ok: false, reason: 'expired' };
  if (
    claims.command !== expected.command ||
    claims.inputHash !== expected.inputHash ||
    claims.subject !== expected.subject
  ) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
