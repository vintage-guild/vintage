// Vintage defaults for @lushly-dev/afd-cli (#9): points connect, call, and shell at /mcp over
// Streamable HTTP unless the caller specifies another URL, transport, or in-process --module.
// Pure over argv + env so tests need no network or filesystem.

export const DEFAULT_MCP_URL = 'https://vintage-gateway.vercel.app/mcp';
export const DEFAULT_TRANSPORT = 'streamable-http';

export interface VintageCliEnv {
  VINTAGE_MCP_URL?: string;
  VINTAGE_MCP_TOKEN?: string;
  AFD_HEADERS?: string;
}

export function mcpUrlFromEnv(env: VintageCliEnv): string {
  const custom = env.VINTAGE_MCP_URL?.trim();
  return custom ? custom : DEFAULT_MCP_URL;
}

function hasAnyFlag(args: readonly string[], names: readonly string[]): boolean {
  return args.some((arg) =>
    names.some((name) => arg === name || (name.startsWith('--') && arg.startsWith(`${name}=`))),
  );
}

/** Whether `connect` already has a positional `<url>` argument. */
function connectHasUrl(rest: readonly string[]): boolean {
  const valueFlags = new Set(['-t', '--transport', '--timeout', '-H', '--header']);
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === undefined) continue;
    if (token === '--') return i + 1 < rest.length;
    if (valueFlags.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith('-')) continue;
    return true;
  }
  return false;
}

export interface PreparedCliInvocation {
  /** Arguments to pass after `[node, script]` into `createCli().parseAsync`. */
  args: string[];
  /** `AFD_HEADERS` value to apply for this invocation when VINTAGE_MCP_TOKEN is set. */
  afdHeaders?: string;
}

function rewriteConnect(rest: readonly string[], url: string): string[] {
  const extra: string[] = [];
  if (!hasAnyFlag(rest, ['-t', '--transport'])) extra.push('--transport', DEFAULT_TRANSPORT);
  if (!connectHasUrl(rest)) extra.push(url);
  return ['connect', ...rest, ...extra];
}

function rewriteWithFlag(
  command: string,
  rest: readonly string[],
  url: string,
  urlFlag: string,
  skipFlags: readonly string[],
  transportFlags: readonly string[],
): string[] {
  if (hasAnyFlag(rest, skipFlags)) return [command, ...rest];
  const extra = [urlFlag, url];
  if (!hasAnyFlag(rest, transportFlags)) extra.push('--transport', DEFAULT_TRANSPORT);
  return [command, ...extra, ...rest];
}

function rewriteCommandArgs(
  command: string | undefined,
  rest: readonly string[],
  url: string,
): string[] {
  if (!command || hasAnyFlag(rest, ['-h', '--help'])) {
    return command ? [command, ...rest] : [];
  }
  if (command === 'connect') return rewriteConnect(rest, url);
  if (command === 'call') {
    return rewriteWithFlag(
      'call',
      rest,
      url,
      '--connect',
      ['--connect', '-m', '--module'],
      ['--transport'],
    );
  }
  if (command === 'shell') {
    return rewriteWithFlag('shell', rest, url, '--url', ['-u', '--url'], ['-t', '--transport']);
  }
  return [command, ...rest];
}

/**
 * Inject Vintage's default `/mcp` URL and `--transport streamable-http` into `afd-cli` arguments
 * without clobbering explicit flags or `--help`. If `VINTAGE_MCP_TOKEN` is set and the caller has
 * not already configured `AFD_HEADERS` or `--header`, build an `Authorization: Bearer` header line
 * (afd-cli never persists headers to disk).
 */
export function prepareCliInvocation(
  argv: readonly string[],
  env: VintageCliEnv = {},
): PreparedCliInvocation {
  const [command, ...rest] = argv;
  const args = rewriteCommandArgs(command, rest, mcpUrlFromEnv(env));
  const token = env.VINTAGE_MCP_TOKEN?.trim();
  const hasExplicitHeader =
    hasAnyFlag(rest, ['-H', '--header']) || Boolean(env.AFD_HEADERS?.trim());
  const afdHeaders = token && !hasExplicitHeader ? `Authorization: Bearer ${token}` : undefined;

  return { args, ...(afdHeaders ? { afdHeaders } : {}) };
}
