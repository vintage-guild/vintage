/**
 * Trust signals attached to component events.
 * @public
 */
export interface TrustSignals {
    /** Confidence level 0-1. Higher = more certain. */
    confidence?: number;
    /** Human-readable explanation of why this event occurred. */
    reasoning?: string;
}
/**
 * Extended emit options with trust signals.
 * @public
 */
export interface TrustEmitOptions extends Omit<CustomEventInit, "detail">, TrustSignals {
}
/**
 * Symbol key for trust metadata in event detail.
 * @public
 */
export declare const TRUST_KEY: "__trust";
