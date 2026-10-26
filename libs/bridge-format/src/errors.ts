export type BridgeErrorCode =
  /** No `!VIN:` prefix: pasted the wrong thing, or a truncated copy. */
  | 'NOT_A_BRIDGE_STRING'
  /** The envelope (`!VIN:<n>!`) is newer than this build understands. */
  | 'UNSUPPORTED_ENCODING'
  /** The string is too long, or inflates past the limit. */
  | 'TOO_LARGE'
  /** Bad characters, broken compression, or bytes that aren't LibSerialize output. */
  | 'CORRUPT'
  /** The payload's schema version is newer than this build, or not one it knows. */
  | 'UNSUPPORTED_VERSION'
  /** The payload's `kind` is not one this build knows. */
  | 'UNKNOWN_KIND'
  /** A valid payload, but not the kind the caller asked for (an export pasted as an import). */
  | 'WRONG_KIND'
  /** The payload doesn't match its schema. */
  | 'INVALID_PAYLOAD';

/** Shaped like an AFD `CommandError`, so commands can return it as-is. */
export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  suggestion: string;
  details?: Record<string, unknown>;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

const SUGGESTIONS: Record<BridgeErrorCode, string> = {
  NOT_A_BRIDGE_STRING:
    'Copy the whole string from the Vintage addon or website, starting with !VIN:',
  UNSUPPORTED_ENCODING:
    'Update the Vintage addon and refresh the website, then copy the string again',
  TOO_LARGE: 'Export a smaller range (one raid at a time) and try again',
  CORRUPT: 'The string was damaged while copying; copy it again in full',
  UNSUPPORTED_VERSION:
    'Update the Vintage addon and refresh the website so both use the same format',
  UNKNOWN_KIND: 'Update the Vintage addon and refresh the website so both use the same format',
  WRONG_KIND: 'Paste an import string into the addon and an export string into the website',
  INVALID_PAYLOAD: 'The string is from an incompatible build; update the addon and copy it again',
};

export function bridgeError<T>(
  code: BridgeErrorCode,
  message: string,
  details?: Record<string, unknown>,
): BridgeResult<T> {
  const error: BridgeError = { code, message, suggestion: SUGGESTIONS[code] };
  if (details) error.details = details;
  return { ok: false, error };
}
