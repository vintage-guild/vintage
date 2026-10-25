import { TRUST_KEY } from "./types.js";
/**
 * Extract trust signals from a CustomEvent.
 * Returns empty object if no trust signals present.
 * @public
 */
export function getTrustSignals(event) {
    const detail = event.detail;
    if (detail && typeof detail === "object" && TRUST_KEY in detail) {
        const trust = detail[TRUST_KEY];
        if (trust && typeof trust === "object") {
            const signals = trust;
            const confidence = signals.confidence;
            return Object.assign(Object.assign({}, (typeof confidence === "number" &&
                Number.isFinite(confidence) &&
                confidence >= 0 &&
                confidence <= 1
                ? { confidence }
                : {})), (typeof signals.reasoning === "string"
                ? { reasoning: signals.reasoning }
                : {}));
        }
    }
    return {};
}
/**
 * Check if an event has trust signals.
 * @public
 */
export function hasTrustSignals(event) {
    const signals = getTrustSignals(event);
    return signals.confidence !== undefined || signals.reasoning !== undefined;
}
/**
 * Wrap detail with trust signals.
 * @internal
 */
export function wrapDetailWithTrust(detail, confidence, reasoning) {
    if (confidence === undefined && reasoning === undefined) {
        return detail; // No-op when no trust signals
    }
    if (confidence !== undefined &&
        (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new RangeError("Trust confidence must be a finite number from 0 to 1.");
    }
    const trust = {};
    if (confidence !== undefined)
        trust.confidence = confidence;
    if (reasoning !== undefined)
        trust.reasoning = reasoning;
    if (detail && typeof detail === "object") {
        return Object.assign(Object.assign({}, detail), { [TRUST_KEY]: trust });
    }
    // Wrap primitives in object
    return { value: detail, [TRUST_KEY]: trust };
}
