import {
  type AnyGuildCommand,
  type Caller,
  createGuildRegistry,
  type GuildRegistry,
  type Tier,
} from '@vintage/guild-kit';

export const TEST_GUILD_ID = 'guild-test';

/** A caller at the given tier; override any field. */
export function makeCaller(tier: Tier, overrides: Partial<Caller> = {}): Caller {
  return {
    surface: 'web',
    guildId: TEST_GUILD_ID,
    tier,
    ...(tier === 'public' ? {} : { memberId: `member-${tier}`, discordId: `discord-${tier}` }),
    ...overrides,
  };
}

/** A controllable clock for tests that depend on time. */
export function fixedClock(start = Date.UTC(2026, 10, 4, 23)) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** A registry over the given commands with a test confirm secret. */
export function testRegistry<Deps>(
  commands: readonly AnyGuildCommand<Deps>[],
  clock = fixedClock(),
): GuildRegistry<Deps> {
  return createGuildRegistry<Deps>({
    commands,
    confirmSecret: 'test-confirm-secret',
    now: clock.now,
  });
}

/**
 * Run a destructive command end to end: preview, then confirm with the returned token.
 * Returns both results so tests can assert on the preview too.
 */
export async function previewAndConfirm<Deps>(
  registry: GuildRegistry<Deps>,
  request: { name: string; input: unknown; caller: Caller },
  deps: Deps,
) {
  const preview = await registry.execute(request, deps);
  if (!preview.success) return { preview, result: preview };
  const { confirmToken } = preview.data as { confirmToken: string };
  const result = await registry.execute({ ...request, confirmToken }, deps);
  return { preview, result };
}
