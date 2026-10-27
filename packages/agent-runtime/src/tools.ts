// The agent's only tools: AFD's discover / detail / call over the guild registry, run as the
// asking member (PLAN §3.10). The agent never changes data on its own: every mutation becomes a
// pending confirmation the member approves with a button. Destructive commands carry their real
// dryRun preview and confirm token; other mutations carry the exact command and input.
import {
  type AnyGuildCommand,
  type Caller,
  type CommandResult,
  type ConfirmPreview,
  error,
  type GuildRegistry,
} from '@vintage/guild-kit';
import { z } from 'zod';
import type { ToolExecution } from './turn';
import type { AgentToolDefinition } from './types';

export const DISCOVER_TOOL = 'afd-discover';
export const DETAIL_TOOL = 'afd-detail';
export const CALL_TOOL = 'afd-call';

/** Tool output the agent reads is capped so one large list can't blow the context. */
export const MAX_TOOL_OUTPUT = 12_000;

export const REGISTRY_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: DISCOVER_TOOL,
    description:
      'List the guild commands you can run for this member: name, what it does, and whether it changes data. Call this first.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: DETAIL_TOOL,
    description:
      "One command's input as JSON Schema. Call before afd-call when unsure of the input.",
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Command name from afd-discover' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: CALL_TOOL,
    description:
      'Run a guild command as this member. Read commands return their result. Commands that change data are NOT run: they return a pending confirmation, and the member confirms it with a button. Tell the member what will change and to press Confirm.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Command name from afd-discover' },
        input: {
          type: 'object',
          description: "The command's input object",
          additionalProperties: true,
        },
      },
      required: ['name', 'input'],
      additionalProperties: false,
    },
  },
];

/** A change the agent prepared and the member must confirm. */
export interface PendingConfirmation {
  command: string;
  input: unknown;
  /** Set for destructive commands: the registry's token from the dryRun preview. */
  confirmToken: string | null;
  /** The dryRun preview for destructive commands, else null. */
  preview: unknown;
  /** One line for the member: what pressing Confirm does. */
  summary: string;
}

export interface RegistryToolExecution extends ToolExecution {
  /** The command a call ran or prepared, for the run ledger. */
  command: string | null;
  confirmation: PendingConfirmation | null;
}

export interface RegistryToolsOptions<Deps> {
  registry: GuildRegistry<Deps>;
  deps: Deps;
  /** The asking member, on the `agent` surface. */
  caller: Caller;
  /** Commands the agent may never see or call (its own commands, surface-only plumbing). */
  hidden?: (name: string) => boolean;
}

const clip = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > MAX_TOOL_OUTPUT
    ? `${text.slice(0, MAX_TOOL_OUTPUT)}… (truncated; ask a narrower question)`
    : text;
};

const argsOf = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
};

const fromResult = (
  command: string | null,
  result: CommandResult<unknown>,
): RegistryToolExecution => ({
  success: result.success,
  output: clip(result),
  command,
  confirmation: null,
});

/** A short, readable line for a mutation: `signup-set: status tentative, eventId r1`. */
export function summarize(command: string, input: unknown): string {
  const fields =
    input && typeof input === 'object'
      ? Object.entries(input as Record<string, unknown>)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .slice(0, 6)
          .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      : [];
  const line = fields.length ? `${command}: ${fields.join(', ')}` : command;
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

export function createRegistryTools<Deps>(options: RegistryToolsOptions<Deps>) {
  const { registry, deps, caller } = options;
  const hidden = options.hidden ?? (() => false);
  const visible = (name: string): AnyGuildCommand<Deps> | undefined =>
    hidden(name) ? undefined : registry.visibleTo(caller).find((c) => c.name === name);

  const notFound = (name: string) =>
    fromResult(
      null,
      error('COMMAND_NOT_FOUND', `No command named "${name}" is available to you`, {
        suggestion: 'Call afd-discover to list the commands you can run',
        retryable: false,
      }),
    );

  async function call(name: string, input: unknown): Promise<RegistryToolExecution> {
    const command = visible(name);
    if (!command) return notFound(name);

    if (!command.mutation) {
      return fromResult(name, await registry.execute({ name, input, caller }, deps));
    }

    const parsed = command.input.safeParse(input);
    if (!parsed.success) {
      return fromResult(
        name,
        error('VALIDATION_ERROR', `Invalid input for ${name}`, {
          suggestion: 'Check the input with afd-detail and try again',
          retryable: false,
          details: { issues: parsed.error.issues },
        }),
      );
    }

    let preview: unknown = null;
    let confirmToken: string | null = null;
    if (command.destructive) {
      // No token: the registry runs the handler with dryRun and returns preview + token.
      const result = await registry.execute({ name, input: parsed.data, caller }, deps);
      if (!result.success) return fromResult(name, result);
      const data = result.data as ConfirmPreview<unknown>;
      preview = data.preview;
      confirmToken = data.confirmToken;
    }
    const confirmation: PendingConfirmation = {
      command: name,
      input: parsed.data,
      confirmToken,
      preview,
      summary: summarize(name, parsed.data),
    };
    return {
      success: true,
      output: clip({
        pendingConfirmation: true,
        summary: confirmation.summary,
        ...(preview === null ? {} : { preview }),
        note: 'Not done yet. The member must press Confirm. Tell them what will change.',
      }),
      command: name,
      confirmation,
    };
  }

  return {
    definitions: REGISTRY_TOOLS,
    async execute(toolName: string, rawArgs: unknown): Promise<RegistryToolExecution> {
      const args = argsOf(rawArgs);
      if (toolName === DISCOVER_TOOL) {
        const list = registry
          .visibleTo(caller)
          .filter((c) => !hidden(c.name))
          .map((c) => ({ name: c.name, description: c.description, changesData: c.mutation }));
        return { success: true, output: clip(list), command: null, confirmation: null };
      }
      if (toolName === DETAIL_TOOL) {
        const name = String(args.name ?? '');
        const command = visible(name);
        if (!command) return notFound(name);
        const detail = {
          name: command.name,
          description: command.description,
          changesData: command.mutation,
          needsConfirmation: command.mutation,
          input: z.toJSONSchema(command.input, { unrepresentable: 'any' }),
        };
        return { success: true, output: clip(detail), command: null, confirmation: null };
      }
      if (toolName === CALL_TOOL) {
        return call(String(args.name ?? ''), args.input ?? {});
      }
      return {
        success: false,
        output: '',
        error: `Unknown tool "${toolName}"`,
        command: null,
        confirmation: null,
      };
    },
  };
}
