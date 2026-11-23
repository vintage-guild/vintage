// Per-member rate limit for /mcp command calls (#175, #9). Pure fixed-window counter over a
// subject's stored bucket, so tests need no Convex and convex/mcp.ts enforces it transactionally
// inside `internal.mcp.call` right after verifying the OAuth token.
import { type CommandResult, error } from '@vintage/guild-kit';

export interface McpRateLimitConfig {
  /** Maximum /mcp command calls allowed per subject in one window. */
  maxCalls: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Generous default per PLAN §3.7: enough for normal Claude/Codex/CLI batches, stops runaway loops. */
export const DEFAULT_MCP_RATE_LIMIT: McpRateLimitConfig = {
  maxCalls: 60,
  windowMs: 60_000,
};

export interface McpRateLimitBucket {
  windowStart: number;
  count: number;
}

export type McpRateLimitCheck =
  | { allowed: true; next: McpRateLimitBucket }
  | { allowed: false; retryAfterMs: number; result: CommandResult<never> };

/** Stable rate-limit key for a resolved /mcp caller: member id first, else Discord id. */
export function rateLimitSubject(caller: { memberId?: string; discordId?: string }): string {
  if (caller.memberId) return `member:${caller.memberId}`;
  if (caller.discordId) return `discord:${caller.discordId}`;
  return 'anonymous';
}

/**
 * Check and advance one fixed-window bucket. A missing or expired bucket starts a fresh window at
 * `now` with `count = 1`. When the window is full, the bucket is left unchanged and an AFD
 * `RATE_LIMITED` CommandResult is returned.
 */
export function checkMcpRateLimit(
  bucket: McpRateLimitBucket | null,
  now: number,
  config: McpRateLimitConfig = DEFAULT_MCP_RATE_LIMIT,
): McpRateLimitCheck {
  if (!bucket || now - bucket.windowStart >= config.windowMs) {
    return { allowed: true, next: { windowStart: now, count: 1 } };
  }
  if (bucket.count < config.maxCalls) {
    return { allowed: true, next: { windowStart: bucket.windowStart, count: bucket.count + 1 } };
  }
  const retryAfterMs = Math.max(1, config.windowMs - (now - bucket.windowStart));
  const waitSeconds = Math.ceil(retryAfterMs / 1000);
  return {
    allowed: false,
    retryAfterMs,
    result: error(
      'RATE_LIMITED',
      `MCP call limit reached (${config.maxCalls} calls per ${Math.round(config.windowMs / 1000)}s)`,
      {
        suggestion: `Wait ${waitSeconds}s and retry`,
        retryable: true,
        details: { retryAfterMs, limit: config.maxCalls, windowMs: config.windowMs },
      },
    ),
  };
}
