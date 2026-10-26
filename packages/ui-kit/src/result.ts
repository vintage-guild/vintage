import {
  type CommandResult as ElementResult,
  failure,
  success,
} from '@lushly-dev/fast-element/command.js';
import type { CommandResult } from '@vintage/guild-kit';

export type { ElementResult };

/**
 * Converts a server `CommandResult` (AFD: `success` plus optional `data` / `error`) into the
 * discriminated union FAST-AF's `@command` methods return, keeping the error's suggestion.
 */
export function toElementResult<T>(result: CommandResult<T>): ElementResult<T> {
  if (result.success) return success(result.data as T, { reasoning: result.reasoning });
  const { code = 'EXECUTION_FAILED', message = 'The command failed', ...rest } = result.error ?? {};
  return failure({ code, message, ...rest });
}

/** The line a component shows for a failed result: the message, then what to do about it. */
export function describeError(result: ElementResult<unknown>): string {
  if (result.success) return '';
  const { message, suggestion } = result.error;
  return [message, suggestion].filter(Boolean).map(sentence).join(' ');
}

const sentence = (text: string | undefined) => `${text?.trim().replace(/[.!?]+$/, '')}.`;
