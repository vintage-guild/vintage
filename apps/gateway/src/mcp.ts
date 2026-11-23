// Stateless /mcp endpoint (#9, PLAN §3.7): builds a per-request AFD 2.4 `createMcpHandler`
// (`toolStrategy: 'lazy'` → afd-discover, afd-detail, afd-call, afd-batch, afd-pipe) over the
// commands Convex says the caller's OAuth bearer token may run. Nothing is kept between requests.
//
// Auth flow:
//   1. Extract one Bearer token (RFC 6750; never in query/form or duplicate headers), then strip
//      `Authorization` from the request so downstream code never sees the raw token.
//   2. POST <VINTAGE_CONVEX_SITE_URL>/gateway/mcp/tools with VINTAGE_GATEWAY_SECRET + { token }.
//      Convex 401 → mcpChallenge(env, refusal); Convex 5xx / network error → 502 with no body leak.
//   3. Build `ZodCommandDefinition[]` from the returned manifest entries (destructive commands
//      advertise an optional `confirmToken` in their schema and forward it to /gateway/mcp/call).
//   4. Run `createMcpHandler` on the request and `dispose()` it in `finally`.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type CommandResult, error, type JsonSchema } from '@lushly-dev/afd-core';
import {
  createMcpHandler,
  defineCommandWithSchema,
  extractBearer,
  type ZodCommandDefinition,
} from '@lushly-dev/afd-server';
import { z } from 'zod';
import {
  isTokenRefusal,
  type McpEnv,
  mcpChallenge,
  mcpUrlOf,
  type TokenRefusal,
} from './mcp-metadata';

/** Convex gateway route settings (same pair interactions.ts uses). */
export interface McpConvexConfig {
  siteUrl: string;
  secret: string;
  fetch?: typeof fetch;
  /** Per-request Convex timeout in milliseconds (default 15s). */
  timeoutMs?: number;
}

const DEFAULT_CONVEX_TIMEOUT_MS = 15_000;

export interface VintageMcpOptions {
  env: McpEnv & { VERCEL_URL?: string; VINTAGE_MCP_ALLOWED_ORIGINS?: string };
  convex?: McpConvexConfig;
  /** Extra Host names to accept (tests, custom proxies). */
  allowedHosts?: string[];
  onError?: (err: Error) => void;
}

/** Shape of one command entry returned by Convex's POST /gateway/mcp/tools. */
interface RemoteManifestEntry {
  name: string;
  description: string;
  tier: string;
  mutation: boolean;
  destructive: boolean;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

interface RemoteCallerView {
  surface: string;
  tier: string;
  memberId?: string;
}

type FetchToolsResult =
  | { kind: 'ok'; caller: RemoteCallerView; tools: RemoteManifestEntry[] }
  | { kind: 'refused'; reason: TokenRefusal }
  | { kind: 'unavailable' };

const PASS_THROUGH_INPUT = z.record(z.string(), z.unknown());

const CONFIRM_TOKEN_PROPERTY: JsonSchema = {
  type: 'string',
  description:
    'Short-lived confirmation token from the preview call. Omit on the first call to preview changes; pass the returned confirmToken on the second call to execute.',
};

const MCP_INSTRUCTIONS = [
  'Vintage is an AFD guild platform. Every command returns a CommandResult JSON envelope ({ success, data, error: { code, message, suggestion } }).',
  'Call afd-discover to list commands available to your guild rank, afd-detail for a command schema, afd-call to run one, and afd-batch or afd-pipe for multi-step calls.',
  'Destructive commands use a two-step confirm flow: call once without confirmToken to preview changes and receive a short-lived confirmToken, then call again with confirmToken in input to confirm.',
].join(' ');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `Authorization` header value in order (Node merges duplicates on `req.headers`). */
function authorizationValues(req: IncomingMessage): string[] {
  const values: string[] = [];
  if (Array.isArray(req.rawHeaders) && req.rawHeaders.length > 0) {
    for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i]?.toLowerCase() === 'authorization') {
        values.push(req.rawHeaders[i + 1] ?? '');
      }
    }
    return values;
  }
  const single = req.headers.authorization;
  if (typeof single === 'string') return [single];
  return [];
}

/** Strip `Authorization` from every view of `req` before passing it downstream. */
function stripAuthorization(req: IncomingMessage): void {
  const headers = req.headers;
  const distinct = req.headersDistinct;
  if (Array.isArray(req.rawHeaders)) {
    for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
      if (req.rawHeaders[i]?.toLowerCase() === 'authorization') {
        req.rawHeaders.splice(i, 2);
      }
    }
  }
  delete headers.authorization;
  if (distinct) delete distinct.authorization;
}

function isFormEncoded(req: IncomingMessage): boolean {
  return (
    req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ===
    'application/x-www-form-urlencoded'
  );
}

function queryOf(req: IncomingMessage): string | undefined {
  const raw = req.url ?? '/';
  const idx = raw.indexOf('?');
  return idx === -1 ? undefined : raw.slice(idx + 1);
}

/** Write a web-standard Response to a Node ServerResponse. */
export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      origins.push(new URL(trimmed).origin);
    } catch {
      // Ignore malformed origin entries so one typo does not break /mcp.
    }
  }
  return [...new Set(origins)];
}

function computeAllowedHosts(options: VintageMcpOptions): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '[::1]']);
  try {
    hosts.add(new URL(mcpUrlOf(options.env)).hostname);
  } catch {
    // Fall back to loopback + explicit hosts if VINTAGE_MCP_URL is malformed.
  }
  if (options.env.VERCEL_URL) {
    const raw = options.env.VERCEL_URL.trim();
    try {
      const host = raw.includes('://') ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
      if (host) hosts.add(host);
    } catch {
      // Ignore malformed VERCEL_URL.
    }
  }
  for (const h of options.allowedHosts ?? []) {
    if (h) hosts.add(h);
  }
  return [...hosts];
}

function isRemoteManifestEntry(value: unknown): value is RemoteManifestEntry {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.tier === 'string' &&
    typeof value.mutation === 'boolean' &&
    typeof value.destructive === 'boolean' &&
    isRecord(value.input)
  );
}

async function parseRefusal(res: Response): Promise<TokenRefusal> {
  try {
    const body: unknown = await res.json();
    const desc = isRecord(body) ? body.error_description : undefined;
    return isTokenRefusal(desc) ? desc : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function fetchRemoteTools(convex: McpConvexConfig, token: string): Promise<FetchToolsResult> {
  const base = convex.siteUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await (convex.fetch ?? fetch)(`${base}/gateway/mcp/tools`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${convex.secret}`,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(convex.timeoutMs ?? DEFAULT_CONVEX_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  if (res.status === 401) {
    return { kind: 'refused', reason: await parseRefusal(res) };
  }
  if (!res.ok) return { kind: 'unavailable' };
  try {
    const body: unknown = await res.json();
    if (!isRecord(body) || !isRecord(body.caller) || !Array.isArray(body.tools)) {
      return { kind: 'unavailable' };
    }
    if (!body.tools.every(isRemoteManifestEntry)) return { kind: 'unavailable' };
    const caller: RemoteCallerView = {
      surface: typeof body.caller.surface === 'string' ? body.caller.surface : 'mcp',
      tier: typeof body.caller.tier === 'string' ? body.caller.tier : 'public',
      ...(typeof body.caller.memberId === 'string' ? { memberId: body.caller.memberId } : {}),
    };
    return { kind: 'ok', caller, tools: body.tools };
  } catch {
    return { kind: 'unavailable' };
  }
}

async function callRemoteCommand(
  convex: McpConvexConfig,
  token: string,
  name: string,
  input: Record<string, unknown>,
  confirmToken?: string,
): Promise<CommandResult<unknown>> {
  const base = convex.siteUrl.replace(/\/$/, '');
  let res: Response;
  try {
    res = await (convex.fetch ?? fetch)(`${base}/gateway/mcp/call`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${convex.secret}`,
      },
      body: JSON.stringify({
        token,
        name,
        input,
        ...(confirmToken !== undefined ? { confirmToken } : {}),
      }),
      signal: AbortSignal.timeout(convex.timeoutMs ?? DEFAULT_CONVEX_TIMEOUT_MS),
    });
  } catch {
    return error('BACKEND_UNAVAILABLE', 'The Vintage backend could not complete this command', {
      suggestion: 'Retry in a moment',
      retryable: true,
    });
  }
  if (res.status === 401) {
    return error('UNAUTHORIZED', 'Your access token is no longer valid', {
      suggestion: 'Sign in again and retry the command',
      retryable: false,
    });
  }
  if (!res.ok) {
    // Never pass Convex 5xx bodies through to MCP clients.
    return error('BACKEND_UNAVAILABLE', 'The Vintage backend could not complete this command', {
      suggestion: 'Retry in a moment',
      retryable: true,
    });
  }
  try {
    const body: unknown = await res.json();
    if (isRecord(body) && isRecord(body.result) && typeof body.result.success === 'boolean') {
      return body.result as unknown as CommandResult<unknown>;
    }
  } catch {
    // Fall through to generic unavailable error.
  }
  return error('BACKEND_UNAVAILABLE', 'The Vintage backend returned an unexpected response', {
    suggestion: 'Retry in a moment',
    retryable: true,
  });
}

function advertisedSchemaFor(entry: RemoteManifestEntry): JsonSchema {
  const base = { ...entry.input, type: 'object' } as JsonSchema;
  if (!entry.destructive) return base;
  const props = isRecord(base.properties) ? { ...base.properties } : {};
  if (!('confirmToken' in props)) {
    props.confirmToken = CONFIRM_TOKEN_PROPERTY;
  }
  return { ...base, properties: props };
}

function toAfdCommands(
  entries: readonly RemoteManifestEntry[],
  convex: McpConvexConfig,
  token: string,
): ZodCommandDefinition[] {
  return entries.map((entry) =>
    defineCommandWithSchema({
      name: entry.name,
      description: entry.description,
      category: entry.name.split('-')[0],
      mutation: entry.mutation,
      destructive: entry.destructive,
      // Convex already filtered to commands this caller may invoke over /mcp; AFD 2.x requires
      // explicit opt-in on `expose.mcp` before a command appears in afd-discover/afd-call.
      expose: { mcp: true, agent: true, cli: true },
      input: PASS_THROUGH_INPUT,
      jsonSchema: advertisedSchemaFor(entry),
      ...(entry.output ? { outputJsonSchema: entry.output as unknown as JsonSchema } : {}),
      async handler(rawInput) {
        if (!entry.destructive || !('confirmToken' in rawInput)) {
          return callRemoteCommand(convex, token, entry.name, rawInput);
        }
        const { confirmToken, ...rest } = rawInput;
        if (confirmToken === undefined) {
          return callRemoteCommand(convex, token, entry.name, rest);
        }
        if (typeof confirmToken !== 'string' || confirmToken.length === 0) {
          return error('VALIDATION_ERROR', 'confirmToken must be a non-empty string', {
            suggestion:
              'Omit confirmToken to preview changes, or pass the exact confirmToken returned by the preview',
            retryable: false,
          });
        }
        return callRemoteCommand(convex, token, entry.name, rest, confirmToken);
      },
    }),
  );
}

/** Normalize Vercel rewrite paths (`/api/mcp`, `/mcp/`) to `/mcp` so afd-server matches. */
function normalizeMcpUrl(req: IncomingMessage): void {
  const raw = req.url ?? '/mcp';
  const queryIdx = raw.indexOf('?');
  const suffix = queryIdx === -1 ? '' : raw.slice(queryIdx);
  req.url = `/mcp${suffix}`;
}

/** Whether this request path targets `/mcp` (including trailing slash or Vercel `/api/mcp`). */
export function isMcpPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '');
  return normalized === '/mcp' || normalized === '/api/mcp';
}

function handlePreflight(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: readonly string[],
): boolean {
  if (req.method !== 'OPTIONS') return false;
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
    );
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  }
  res.statusCode = 204;
  res.end();
  return true;
}

/** Extract and validate the request's single Bearer token, or return the 401 challenge. */
function authenticateRequest(
  req: IncomingMessage,
  env: McpEnv,
): { token: string } | { response: Response } {
  if (isFormEncoded(req)) {
    return { response: mcpChallenge(env, 'unknown') };
  }
  const bearer = extractBearer(authorizationValues(req), queryOf(req));
  if ('refused' in bearer) {
    return {
      response: bearer.refused === 'no-token' ? mcpChallenge(env) : mcpChallenge(env, 'unknown'),
    };
  }
  stripAuthorization(req);
  return { token: bearer.token };
}

/**
 * Create the stateless `/mcp` Node HTTP handler. Each request authenticates its Bearer token
 * against Convex, constructs a fresh AFD `createMcpHandler` scoped strictly to that caller's
 * visible commands with `toolStrategy: 'lazy'`, serves the request, and disposes the handler.
 */
export function createVintageMcpHandler(options: VintageMcpOptions) {
  const allowedHosts = computeAllowedHosts(options);
  const allowedOrigins = parseAllowedOrigins(options.env.VINTAGE_MCP_ALLOWED_ORIGINS);

  return async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (handlePreflight(req, res, allowedOrigins)) return;

    if (!options.convex) {
      await sendResponse(
        res,
        Response.json({ error: 'MCP endpoint is not configured' }, { status: 500 }),
      );
      return;
    }

    const auth = authenticateRequest(req, options.env);
    if ('response' in auth) {
      await sendResponse(res, auth.response);
      return;
    }

    const fetched = await fetchRemoteTools(options.convex, auth.token);
    if (fetched.kind === 'refused') {
      await sendResponse(res, mcpChallenge(options.env, fetched.reason));
      return;
    }
    if (fetched.kind === 'unavailable') {
      await sendResponse(res, Response.json({ error: 'backend unavailable' }, { status: 502 }));
      return;
    }

    const commands = toAfdCommands(fetched.tools, options.convex, auth.token);
    normalizeMcpUrl(req);

    const mcp = createMcpHandler({
      name: 'vintage',
      version: '0.1.0',
      commands,
      toolStrategy: 'lazy',
      toolsListTtlMs: 0,
      allowedHosts,
      cors: allowedOrigins.length > 0,
      allowedOrigins,
      instructions: MCP_INSTRUCTIONS,
      actor: {
        kind: 'agent',
        ...(fetched.caller.memberId ? { onBehalfOf: fetched.caller.memberId } : {}),
      },
      onError: options.onError,
    });
    try {
      await mcp(req, res);
    } finally {
      mcp.dispose();
    }
  };
}
