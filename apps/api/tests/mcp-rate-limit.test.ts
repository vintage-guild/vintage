import { describe, expect, it } from 'vitest';
import { checkMcpRateLimit, DEFAULT_MCP_RATE_LIMIT, rateLimitSubject } from '../src/mcp-rate-limit';

const NOW = 1_800_000_000_000;

describe('MCP per-member rate limit', () => {
  it('starts a new window for a first call and counts up to the cap', () => {
    const config = { maxCalls: 2, windowMs: 60_000 };
    const first = checkMcpRateLimit(null, NOW, config);
    expect(first).toEqual({ allowed: true, next: { windowStart: NOW, count: 1 } });
    if (!first.allowed) return;

    const second = checkMcpRateLimit(first.next, NOW + 5_000, config);
    expect(second).toEqual({ allowed: true, next: { windowStart: NOW, count: 2 } });
    if (!second.allowed) return;

    const third = checkMcpRateLimit(second.next, NOW + 10_000, config);
    expect(third.allowed).toBe(false);
    if (third.allowed) return;
    expect(third.retryAfterMs).toBe(50_000);
    expect(third.result).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED', retryable: true },
    });
    expect(third.result.error?.suggestion).toContain('50s');
  });

  it('resets once the window elapses', () => {
    const config = { maxCalls: 1, windowMs: 60_000 };
    const full = { windowStart: NOW, count: 1 };
    expect(checkMcpRateLimit(full, NOW + 59_999, config).allowed).toBe(false);
    expect(checkMcpRateLimit(full, NOW + 60_000, config)).toEqual({
      allowed: true,
      next: { windowStart: NOW + 60_000, count: 1 },
    });
  });

  it('uses a generous default limit and keys by memberId before discordId', () => {
    expect(DEFAULT_MCP_RATE_LIMIT).toEqual({ maxCalls: 60, windowMs: 60_000 });
    expect(rateLimitSubject({ memberId: 'm1', discordId: 'd1' })).toBe('member:m1');
    expect(rateLimitSubject({ discordId: 'd1' })).toBe('discord:d1');
    expect(rateLimitSubject({})).toBe('anonymous');
  });
});
