// What the /mcp endpoint (apps/gateway, on AFD's stateless handler) asks Convex for (#9). The
// gateway can't run commands itself: their data lives here. So for each MCP request it forwards the
// member's OAuth token, with the gateway secret:
//   POST /gateway/mcp/tools  { token }                          → the caller and the tools they may use
//   POST /gateway/mcp/call   { token, name, input, confirmToken } → the command's CommandResult
// A token that doesn't resolve answers 401 with `invalid_token`, which /mcp turns into its OAuth
// challenge. Pure over ports, so tests don't need Convex; convex/http.ts and convex/mcp.ts wire it.
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { json, refuseUnlessGateway } from './gateway-auth';
import type { McpCallerResult, McpTokenRefusal } from './mcp-caller';

/** The caller the gateway sees: enough to label results, never more than it needs. */
export interface McpCallerView {
  surface: Caller['surface'];
  tier: Caller['tier'];
  memberId?: string;
}

export type McpTools = { refused: McpTokenRefusal } | { caller: McpCallerView; tools: unknown[] };
export type McpCall = { refused: McpTokenRefusal } | { result: CommandResult<unknown> };

export interface McpCallRequest {
  name: string;
  input: unknown;
  confirmToken?: string;
}

export interface McpGatewayPorts {
  /** VINTAGE_GATEWAY_SECRET. */
  secret: string | undefined;
  tools(token: string): Promise<McpTools>;
  call(token: string, request: McpCallRequest): Promise<McpCall>;
}

export const viewOf = (caller: Caller): McpCallerView => ({
  surface: caller.surface,
  tier: caller.tier,
  ...(caller.memberId ? { memberId: caller.memberId } : {}),
});

/** The tools for a resolved token: the manifest entries the caller may run (src/registry.ts). */
export function toolsFor(
  resolved: McpCallerResult,
  visibleManifest: (caller: Caller) => unknown[],
): McpTools {
  if ('refused' in resolved) return resolved;
  return { caller: viewOf(resolved.caller), tools: visibleManifest(resolved.caller) };
}

/** Run one command for a resolved token, or refuse the token. */
export async function callFor(
  resolved: McpCallerResult,
  request: McpCallRequest,
  execute: (caller: Caller, request: McpCallRequest) => Promise<CommandResult<unknown>>,
): Promise<McpCall> {
  if ('refused' in resolved) return resolved;
  return { result: await execute(resolved.caller, request) };
}

const invalidToken = (reason: McpTokenRefusal) =>
  json({ error: 'invalid_token', error_description: reason }, 401);

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The call body, or the refusal to send for it. */
function parseCall(
  body: Record<string, unknown> | null,
): Response | { token: string; request: McpCallRequest } {
  if (!body) return json({ error: 'invalid JSON' }, 400);
  if (!isText(body.token)) return invalidToken('missing');
  if (!isText(body.name)) return json({ error: 'name is required' }, 400);
  if (body.confirmToken !== undefined && !isText(body.confirmToken)) {
    return json({ error: 'confirmToken must be a string' }, 400);
  }
  return {
    token: body.token,
    request: {
      name: body.name,
      input: body.input ?? {},
      ...(isText(body.confirmToken) ? { confirmToken: body.confirmToken } : {}),
    },
  };
}

export function createMcpGatewayRoutes(ports: McpGatewayPorts) {
  return {
    async tools(request: Request): Promise<Response> {
      const refused = refuseUnlessGateway(request, ports.secret);
      if (refused) return refused;
      const body = await readBody(request);
      if (!body) return json({ error: 'invalid JSON' }, 400);
      if (!isText(body.token)) return invalidToken('missing');
      const result = await ports.tools(body.token);
      return 'refused' in result ? invalidToken(result.refused) : json(result);
    },

    async call(request: Request): Promise<Response> {
      const refused = refuseUnlessGateway(request, ports.secret);
      if (refused) return refused;
      const parsed = parseCall(await readBody(request));
      if (parsed instanceof Response) return parsed;
      const result = await ports.call(parsed.token, parsed.request);
      return 'refused' in result ? invalidToken(result.refused) : json(result);
    },
  };
}
