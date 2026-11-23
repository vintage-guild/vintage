import type { CommandResult } from '@vintage/guild-kit';
import { describe, expect, it, vi } from 'vitest';
import { type CommandClient, watchCommand } from './client';

describe('watchCommand', () => {
  it('delegates to client.watch when available and returns its unsubscribe', () => {
    const unsubscribe = vi.fn();
    let emit: ((r: CommandResult<string>) => void) | undefined;
    let emitError: ((e: Error) => void) | undefined;
    const watch = vi.fn(
      (
        _name: string,
        _input: unknown,
        onUpdate: (r: CommandResult<string>) => void,
        onError?: (e: Error) => void,
      ) => {
        emit = onUpdate;
        emitError = onError;
        return unsubscribe;
      },
    );
    const client: CommandClient = {
      read: vi.fn(),
      run: vi.fn(),
      watch: watch as CommandClient['watch'],
    };
    const seen: CommandResult<string>[] = [];
    const errors: Error[] = [];
    const stop = watchCommand<string>(
      client,
      'raid-get',
      { eventId: 'e1' },
      (r) => seen.push(r),
      (e) => errors.push(e),
    );
    expect(watch).toHaveBeenCalledWith(
      'raid-get',
      { eventId: 'e1' },
      expect.any(Function),
      expect.any(Function),
    );
    emit?.({ success: true, data: 'first' });
    emit?.({ success: true, data: 'second' });
    emitError?.(new Error('dropped'));
    expect(seen.map((r) => r.data)).toEqual(['first', 'second']);
    expect(errors.map((e) => e.message)).toEqual(['dropped']);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('falls back to a single read() when client.watch is absent, and cancels on unsubscribe', async () => {
    let resolveRead: ((r: CommandResult<string>) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<CommandResult<string>>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const client: CommandClient = {
      read: read as CommandClient['read'],
      run: vi.fn(),
    };
    const seen: CommandResult<string>[] = [];
    const stop = watchCommand<string>(client, 'raid-get', { eventId: 'e1' }, (r) => seen.push(r));
    expect(read).toHaveBeenCalledWith('raid-get', { eventId: 'e1' });
    stop();
    resolveRead?.({ success: true, data: 'late' });
    await Promise.resolve();
    expect(seen).toEqual([]);
  });

  it('forwards fallback read rejections to onError when still subscribed', async () => {
    const client: CommandClient = {
      read: vi.fn(async () => {
        throw new Error('offline');
      }) as CommandClient['read'],
      run: vi.fn(),
    };
    const errors: Error[] = [];
    watchCommand(client, 'raid-get', {}, vi.fn(), (e) => errors.push(e));
    await new Promise((r) => setTimeout(r, 0));
    expect(errors.map((e) => e.message)).toEqual(['offline']);
  });
});
