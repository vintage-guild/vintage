---
name: vintage-afd-commands
description: Add or change a Vintage command — guild-kit `commandsFor`, Zod input, permission tier, CommandResult errors, destructive dryRun/confirm flow, and the command manifest. Load before touching any `src/commands/` file or `packages/guild-kit`.
---

# Vintage commands

Every capability is a command. Surfaces (web, `/mcp`, Discord, CLI, hosted agent) only call
the registry in `apps/api`; they never contain logic.

## Declare

```ts
// modules/<m>/src/store.ts
export const command = commandsFor<MyDeps>();

// modules/<m>/src/commands/thing.ts
export const thingAdd = command({
  name: 'thing-add',            // kebab-case <noun>-<verb>; defineGuildCommand throws otherwise
  description: 'One sentence an agent can act on.',
  tier: 'member',               // public | member | trial | raider | officer
  mutation: true,               // changes data → runs via commands.run, not read
  input: z.object({ ... }),     // validated by the registry before the handler runs
  handler: async (input, { caller, guildId, deps, dryRun, now }) => {
    return success(data, { reasoning: 'short why' });
  },
});
```

Then add it to the module's `src/commands/index.ts` list and run `pnpm manifest:write`.

## Errors

Return `error(CODE, message, { suggestion, retryable })`, never throw for expected cases.
Codes are SCREAMING_SNAKE (`CHARACTER_NOT_FOUND`). Always give a `suggestion` an agent can follow.
The registry already returns `COMMAND_NOT_FOUND` (unknown or above the caller's tier — same
answer on purpose), `VALIDATION_ERROR`, and `CONFIRMATION_INVALID`.

## Destructive commands

Set `destructive: true`. The registry calls the handler with `dryRun: true` first and returns
the preview plus a 5-minute `confirmToken` bound to command, exact input, and caller. Your
handler must not change anything when `dryRun` is true. Test with `previewAndConfirm` from
`@vintage/testing`.

## Permissions inside a handler

The tier gate is coarse. Ownership rules ("only your own characters, officers anyone") live in
the handler with `tierAllows(caller.tier, 'officer')`. Return a not-found style error when the
caller may not see the target.

## Tests

Use `testRegistry`, `makeCaller`, and the module's memory deps. Test through
`registry.execute`, not by calling handlers directly, so tier and validation are covered.
