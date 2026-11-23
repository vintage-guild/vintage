import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createVintageMcpHandler, type McpConvexConfig } from './mcp';

const ENV = {
  VINTAGE_CONVEX_SITE_URL: 'https://dusty-sardine-902.convex.site',
  VINTAGE_MCP_URL: 'https://vintage-gateway.vercel.app/mcp',
};
const SECRET = 'gateway-secret';
const MODERN_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2026-07-28',
};

const RAIDER_TOOLS = [
  {
    name: 'member-me',
    description: 'Return the signed-in member profile',
    tier: 'public',
    mutation: false,
    destructive: false,
    input: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'character-add',
    description: 'Register a WoW character',
    tier: 'member',
    mutation: true,
    destructive: false,
    input: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'character-remove',
    description: 'Remove a registered character',
    tier: 'member',
    mutation: true,
    destructive: true,
    input: {
      type: 'object',
      properties: { characterId: { type: 'string' } },
      required: ['characterId'],
    },
  },
];

const OFFICER_TOOLS = [
  ...RAIDER_TOOLS,
  {
    name: 'member-list',
    description: 'List guild members',
    tier: 'officer',
    mutation: false,
    destructive: false,
    input: { type: 'object', properties: {} },
  },
];

const servers: Array<ReturnType<typeof createServer>> = [];

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): Promise<string> {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

interface RecordedCall {
  path: string;
  auth: string | null;
  body: Record<string, unknown>;
}

interface FakeConvexOptions {
  toolsByToken?: Record<string, { caller: Record<string, unknown>; tools: unknown[] }>;
  refuseTools?: Record<string, string>;
  toolsStatus?: number;
  toolsBody?: string;
  callHandler?: (body: Record<string, unknown>) => Response;
}

function fakeToolsResponse(options: FakeConvexOptions, body: Record<string, unknown>): Response {
  if (options.toolsStatus) {
    return new Response(options.toolsBody ?? 'secret stack trace', {
      status: options.toolsStatus,
    });
  }
  const token = String(body.token ?? '');
  const refusal = options.refuseTools?.[token];
  if (refusal) {
    return Response.json({ error: 'invalid_token', error_description: refusal }, { status: 401 });
  }
  const match = options.toolsByToken?.[token];
  if (!match) {
    return Response.json({ error: 'invalid_token', error_description: 'unknown' }, { status: 401 });
  }
  return Response.json(match);
}

/** Fake Convex backend matching apps/api/src/mcp-gateway.ts. */
function fakeConvex(options: FakeConvexOptions) {
  const recorded: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('authorization');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    recorded.push({ path: url.pathname, auth, body });

    if (url.pathname === '/gateway/mcp/tools') return fakeToolsResponse(options, body);
    if (url.pathname === '/gateway/mcp/call') {
      return options.callHandler
        ? options.callHandler(body)
        : Response.json({ result: { success: true, data: { ok: true } } });
    }
    return new Response('not found', { status: 404 });
  };
  const convex: McpConvexConfig = {
    siteUrl: ENV.VINTAGE_CONVEX_SITE_URL,
    secret: SECRET,
    fetch: fetchImpl,
  };
  return { convex, recorded };
}

async function rpc(
  baseUrl: string,
  method: string,
  params: Record<string, unknown> = {},
  options: { token?: string; path?: string; protocol?: 'modern' | 'legacy' } = {},
) {
  const path = options.path ?? '/mcp';
  const headers: Record<string, string> =
    options.protocol === 'legacy'
      ? { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
      : { ...MODERN_HEADERS, 'mcp-method': method };
  if (options.protocol !== 'legacy' && method === 'tools/call' && typeof params.name === 'string') {
    headers['mcp-name'] = params.name;
  }
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const envelopeParams =
    options.protocol === 'legacy'
      ? params
      : {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        };
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: envelopeParams }),
  });
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let body: Record<string, unknown>;
  if (contentType.includes('text/event-stream')) {
    const dataLine = text.split(/\r?\n/).find((line) => line.startsWith('data: '));
    body = dataLine ? (JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>) : {};
  } else {
    body = JSON.parse(text) as Record<string, unknown>;
  }
  return { status: res.status, headers: res.headers, body };
}

function parseToolResult(rpcBody: Record<string, unknown>) {
  const result = rpcBody.result as { content?: Array<{ text?: string }>; isError?: boolean };
  const text = result?.content?.[0]?.text ?? '{}';
  return { data: JSON.parse(text), isError: result?.isError };
}

describe('stateless /mcp handler', () => {
  it('challenges unauthenticated, malformed, query-token, and refused-token requests', async () => {
    const { convex, recorded } = fakeConvex({
      refuseTools: {
        expired: 'expired',
        smuggled: 'x", error="insufficient_scope',
      },
    });
    const base = await startServer(createVintageMcpHandler({ env: ENV, convex }));

    // No Authorization header → RFC 9728 challenge without invalid_token error.
    const noToken = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: MODERN_HEADERS,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(noToken.status).toBe(401);
    expect(noToken.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://vintage-gateway.vercel.app/.well-known/oauth-protected-resource/mcp", scope="commands offline_access"',
    );

    // Malformed Authorization header → 401 invalid_token without calling Convex.
    const malformed = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...MODERN_HEADERS, authorization: 'Basic abc' },
      body: '{}',
    });
    expect(malformed.status).toBe(401);
    expect(malformed.headers.get('www-authenticate')).toContain('error="invalid_token"');

    // Token in query string → refused before calling Convex.
    const inQuery = await fetch(`${base}/mcp?access_token=secret`, {
      method: 'POST',
      headers: { ...MODERN_HEADERS, authorization: 'Bearer tok' },
      body: '{}',
    });
    expect(inQuery.status).toBe(401);
    expect(recorded).toEqual([]);

    // Convex 401 expired → challenge with error_description="expired".
    const expired = await rpc(base, 'tools/list', {}, { token: 'expired' });
    expect(expired.status).toBe(401);
    expect(expired.headers.get('www-authenticate')).toContain('error_description="expired"');

    // Smuggled refusal text → sanitized to "unknown".
    const smuggled = await rpc(base, 'tools/list', {}, { token: 'smuggled' });
    expect(smuggled.status).toBe(401);
    expect(smuggled.headers.get('www-authenticate')).toContain('error_description="unknown"');
    expect(smuggled.headers.get('www-authenticate')).not.toContain('insufficient_scope');
  });

  it('never leaks Convex 5xx bodies to the client, and fails cleanly when unconfigured', async () => {
    const unconfigured = await startServer(createVintageMcpHandler({ env: ENV }));
    const res500 = await fetch(`${unconfigured}/mcp`, { method: 'POST' });
    expect(res500.status).toBe(500);
    expect(await res500.json()).toEqual({ error: 'MCP endpoint is not configured' });

    const { convex } = fakeConvex({
      toolsStatus: 500,
      toolsBody: 'INTERNAL_SECRET_STACK_TRACE_DO_NOT_LEAK',
    });
    const base = await startServer(createVintageMcpHandler({ env: ENV, convex }));
    const res = await rpc(base, 'tools/list', {}, { token: 'tok' });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'backend unavailable' });
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL_SECRET_STACK_TRACE');
  });

  it('lists the five AFD meta-tools and scopes afd-discover per caller tier statelessly', async () => {
    const { convex, recorded } = fakeConvex({
      toolsByToken: {
        'raider-tok': {
          caller: { surface: 'mcp', tier: 'raider', memberId: 'm-raider' },
          tools: RAIDER_TOOLS,
        },
        'officer-tok': {
          caller: { surface: 'mcp', tier: 'officer', memberId: 'm-officer' },
          tools: OFFICER_TOOLS,
        },
      },
    });
    const base = await startServer(createVintageMcpHandler({ env: ENV, convex }));

    const list = await rpc(base, 'tools/list', {}, { token: 'raider-tok' });
    expect(list.status).toBe(200);
    const listResult = list.body.result as { tools: Array<{ name: string }> };
    const toolNames = listResult.tools.map((t) => t.name);
    expect(toolNames.sort()).toEqual([
      'afd-batch',
      'afd-call',
      'afd-detail',
      'afd-discover',
      'afd-pipe',
    ]);
    // Gateway authenticated with VINTAGE_GATEWAY_SECRET.
    expect(recorded[0]?.auth).toBe(`Bearer ${SECRET}`);

    const raiderDiscover = await rpc(
      base,
      'tools/call',
      { name: 'afd-discover', arguments: {} },
      { token: 'raider-tok' },
    );
    const raiderNames = (
      parseToolResult(raiderDiscover.body).data.data.commands as Array<{ name: string }>
    ).map((c) => c.name);
    expect(raiderNames).toContain('member-me');
    expect(raiderNames).not.toContain('member-list');

    // Same server, next request with officer token: sees member-list.
    const officerDiscover = await rpc(
      base,
      'tools/call',
      { name: 'afd-discover', arguments: {} },
      { token: 'officer-tok' },
    );
    const officerNames = (
      parseToolResult(officerDiscover.body).data.data.commands as Array<{ name: string }>
    ).map((c) => c.name);
    expect(officerNames).toContain('member-list');
  });

  it('runs commands, destructive preview/confirm-token flow, afd-batch, and afd-pipe', async () => {
    const { convex, recorded } = fakeConvex({
      toolsByToken: {
        'officer-tok': {
          caller: { surface: 'mcp', tier: 'officer', memberId: 'm-officer' },
          tools: OFFICER_TOOLS,
        },
      },
      callHandler: (body) => {
        if (body.name === 'member-list') {
          return Response.json({
            result: { success: true, data: { members: [{ displayName: 'Aeryn' }] } },
          });
        }
        if (body.name === 'character-add') {
          return Response.json({
            result: {
              success: true,
              data: { id: 'char-42', name: (body.input as { name: string }).name },
            },
          });
        }
        if (body.name === 'character-remove') {
          if (!body.confirmToken) {
            return Response.json({
              result: {
                success: true,
                data: {
                  preview: { removed: 'char-42' },
                  confirmToken: 'hmac-tok-1',
                  expiresInMs: 300_000,
                },
              },
            });
          }
          return Response.json({
            result: { success: true, data: { removed: true, confirmTokenUsed: body.confirmToken } },
          });
        }
        return Response.json({ result: { success: true, data: {} } });
      },
    });
    const base = await startServer(createVintageMcpHandler({ env: ENV, convex }));

    // afd-detail advertises confirmToken for destructive commands, not read-only commands.
    const detail = await rpc(
      base,
      'tools/call',
      { name: 'afd-detail', arguments: { command: ['character-remove', 'member-list'] } },
      { token: 'officer-tok' },
    );
    const details = parseToolResult(detail.body).data.data as Array<{
      name: string;
      inputSchema: { properties?: Record<string, unknown> };
    }>;
    expect(details[0]?.inputSchema.properties).toHaveProperty('confirmToken');
    expect(details[1]?.inputSchema.properties).not.toHaveProperty('confirmToken');

    // Step 1 of destructive flow: preview returns confirmToken.
    const preview = await rpc(
      base,
      'tools/call',
      {
        name: 'afd-call',
        arguments: { command: 'character-remove', input: { characterId: 'char-42' } },
      },
      { token: 'officer-tok' },
    );
    const previewResult = parseToolResult(preview.body).data;
    expect(previewResult.success).toBe(true);
    expect(previewResult.data.confirmToken).toBe('hmac-tok-1');

    // Step 2 of destructive flow: confirmToken is stripped from input and forwarded top-level.
    const confirmed = await rpc(
      base,
      'tools/call',
      {
        name: 'afd-call',
        arguments: {
          command: 'character-remove',
          input: { characterId: 'char-42', confirmToken: 'hmac-tok-1' },
        },
      },
      { token: 'officer-tok' },
    );
    expect(parseToolResult(confirmed.body).data).toMatchObject({
      success: true,
      data: { removed: true, confirmTokenUsed: 'hmac-tok-1' },
    });
    const confirmCall = recorded.find(
      (r) => r.path === '/gateway/mcp/call' && r.body.confirmToken === 'hmac-tok-1',
    );
    expect(confirmCall?.body).toEqual({
      token: 'officer-tok',
      name: 'character-remove',
      input: { characterId: 'char-42' },
      confirmToken: 'hmac-tok-1',
    });

    // Invalid confirmToken fails locally with VALIDATION_ERROR.
    const badConfirm = await rpc(
      base,
      'tools/call',
      {
        name: 'afd-call',
        arguments: {
          command: 'character-remove',
          input: { characterId: 'char-42', confirmToken: 123 },
        },
      },
      { token: 'officer-tok' },
    );
    expect(parseToolResult(badConfirm.body).data).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });

    // afd-batch runs multiple commands in one round trip.
    const batch = await rpc(
      base,
      'tools/call',
      {
        name: 'afd-batch',
        arguments: {
          commands: [
            { id: '1', command: 'member-list', input: {} },
            { id: '2', command: 'character-add', input: { name: 'Aeryn' } },
          ],
        },
      },
      { token: 'officer-tok' },
    );
    const batchData = parseToolResult(batch.body).data;
    expect(batchData.success).toBe(true);
    expect(batchData.results).toHaveLength(2);

    // afd-pipe chains step 1 output into step 2 input ($prev.id).
    const pipe = await rpc(
      base,
      'tools/call',
      {
        name: 'afd-pipe',
        arguments: {
          steps: [
            { command: 'character-add', input: { name: 'Aeryn' } },
            { command: 'character-remove', input: { characterId: '$prev.id' } },
          ],
        },
      },
      { token: 'officer-tok' },
    );
    const pipeData = parseToolResult(pipe.body).data;
    expect(pipeData.steps).toHaveLength(2);
    expect(pipeData.steps[1].status).toBe('success');
    expect(pipeData.steps[1].data.confirmToken).toBe('hmac-tok-1');
  });

  it('sanitizes Convex 5xx and mid-flight 401 during command calls, and handles rewrite/legacy paths', async () => {
    const { convex } = fakeConvex({
      toolsByToken: {
        tok: {
          caller: { surface: 'mcp', tier: 'officer', memberId: 'm-1' },
          tools: OFFICER_TOOLS,
        },
      },
      callHandler: (body) => {
        if (body.name === 'member-list') {
          return new Response('SENSITIVE_CONVEX_500_BODY', { status: 500 });
        }
        return Response.json(
          { error: 'invalid_token', error_description: 'expired' },
          { status: 401 },
        );
      },
    });
    const base = await startServer(createVintageMcpHandler({ env: ENV, convex }));

    // 5xx on /call becomes BACKEND_UNAVAILABLE without leaking the Convex body.
    const call500 = await rpc(
      base,
      'tools/call',
      { name: 'afd-call', arguments: { command: 'member-list', input: {} } },
      { token: 'tok', path: '/api/mcp' },
    );
    expect(call500.status).toBe(200);
    const parsed500 = parseToolResult(call500.body).data;
    expect(parsed500).toMatchObject({ success: false, error: { code: 'BACKEND_UNAVAILABLE' } });
    expect(JSON.stringify(parsed500)).not.toContain('SENSITIVE_CONVEX_500_BODY');

    // Mid-flight 401 on /call becomes UNAUTHORIZED.
    const call401 = await rpc(
      base,
      'tools/call',
      { name: 'afd-call', arguments: { command: 'member-me', input: {} } },
      { token: 'tok', path: '/mcp/' },
    );
    expect(parseToolResult(call401.body).data).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });

    // Legacy 2025-era initialize handshake still works statelessly.
    const init = await rpc(
      base,
      'initialize',
      {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
      { token: 'tok', protocol: 'legacy' },
    );
    expect(init.status).toBe(200);
    const initResult = init.body.result as { serverInfo: { name: string } };
    expect(initResult.serverInfo.name).toBe('vintage');
  });
});
