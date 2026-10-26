import { describe, expect, it } from 'vitest';
import { createStubClient, NOT_CONNECTED } from './client';
import { titleCase } from './labels';
import { describeError, toElementResult } from './result';

describe('toElementResult', () => {
  it('keeps data and reasoning on success', () => {
    expect(toElementResult({ success: true, data: { id: 'c1' }, reasoning: 'Main' })).toEqual({
      success: true,
      data: { id: 'c1' },
      metadata: { reasoning: 'Main' },
    });
  });

  it('keeps the error code, message, and suggestion on failure', () => {
    const result = toElementResult({
      success: false,
      error: { code: 'X', message: 'Nope.', suggestion: 'Try again', retryable: true },
    });
    expect(result).toEqual({
      success: false,
      error: { code: 'X', message: 'Nope.', suggestion: 'Try again', retryable: true },
    });
    expect(describeError(result)).toBe('Nope. Try again.');
  });

  it('fills in a failure with no error object', () => {
    const result = toElementResult({ success: false });
    expect(result.success === false && result.error.code).toBe('EXECUTION_FAILED');
  });
});

describe('createStubClient', () => {
  it('answers reads and runs with NOT_CONNECTED', async () => {
    const client = createStubClient();
    for (const result of [await client.read('member-me'), await client.run('character-add', {})]) {
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(NOT_CONNECTED);
    }
  });
});

describe('titleCase', () => {
  it('turns wow-data ids into display text', () => {
    expect(titleCase('beast-mastery')).toBe('Beast Mastery');
    expect(titleCase('feral-tank')).toBe('Feral Tank');
  });
});
