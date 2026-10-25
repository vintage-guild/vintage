import type { TrustSignals } from "./types.js";
/**
 * Extract trust signals from a CustomEvent.
 * Returns empty object if no trust signals present.
 * @public
 */
export declare function getTrustSignals(event: CustomEvent): TrustSignals;
/**
 * Check if an event has trust signals.
 * @public
 */
export declare function hasTrustSignals(event: CustomEvent): boolean;
/**
 * Wrap detail with trust signals.
 * @internal
 */
export declare function wrapDetailWithTrust(detail: unknown, confidence?: number, reasoning?: string): unknown;
