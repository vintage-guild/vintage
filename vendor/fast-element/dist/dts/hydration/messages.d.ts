/**
 * Centralized hydration mismatch message strings used by both the default
 * minimal `HydrationDiagnostic` and the opt-in `hydrationDebugger` rich
 * formatter, and by the structural-error throw sites in
 * `target-builder.ts`.
 *
 * Static text is exported as a plain `const`; interpolated text is exported
 * as a small builder function. Plain `export const` declarations tree-shake
 * better than frozen-object property bags, so unused strings drop out of
 * bundles cleanly.
 */
/**
 * Fallback host tag name used when a hydration mismatch is detected on a
 * node that is not inside a shadow root.
 */
export declare const unknownHostName = "unknown";
export declare const aspectLabelAttribute = "attribute";
export declare const aspectLabelBooleanAttribute = "boolean attribute";
export declare const aspectLabelProperty = "property";
export declare const aspectLabelContent = "content";
export declare const aspectLabelTokenList = "token list";
export declare const aspectLabelEvent = "event";
/** Fallback used when the aspectType is missing or unknown. */
export declare const aspectLabelUnknown = "binding";
/**
 * Combines an aspect label with the original source aspect identifier from
 * markup (e.g. `"property className"`). Returns the bare label when no
 * source aspect was captured.
 */
export declare function formatAspect(label: string, sourceAspect: string | undefined): string;
/**
 * Formats the "Expected" half of the rich hydration mismatch message, e.g.
 * `"<span> with content binding"` or `"content binding"` when no tag is
 * associated with the binding factory.
 */
export declare function formatExpectedTarget(tagName: string | null, aspect: string): string;
/**
 * Default minimal hydration mismatch message used when the
 * `hydrationDebugger` opt-in is not installed. The optional `detail` string
 * carries the structural expectation surfaced by `target-builder.ts`.
 */
export declare function formatDefaultMismatchMessage(hostName: string, detail: string | undefined): string;
/**
 * Rich `Expected … / Received …` hydration mismatch message format produced
 * by the `hydrationDebugger` formatter.
 */
export declare function formatRichMismatchMessage(hostName: string, expectedText: string, receivedHtml: string): string;
export declare const expectedContentAfterStartMarker = "content following `<!--fe:b-->` content binding marker";
export declare const expectedContentEndMarker = "matching `<!--fe:/b-->` content binding close marker";
export declare const expectedElementBoundaryEndMarker = "matching `<!--fe:/e-->` element boundary close marker";
/**
 * Builds the "no more attribute bindings" structural expectation message
 * thrown when an element's `data-fe` count claims more attribute bindings
 * than the compiled template defines.
 */
export declare function formatNoMoreAttributeBindings(factoryCount: number): string;
/**
 * Builds the "no more content bindings" structural expectation message
 * thrown when the SSR DOM contains more content binding markers than the
 * compiled template defines.
 */
export declare function formatNoMoreContentBindings(factoryCount: number): string;
