import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet message status indicator.
 *
 * @summary Compact status row for showing chat state between messages.
 *          Maps to TanStack AI / AI SDK streaming status values.
 * @slot - Custom status text (overrides default).
 * @csspart root - The status row.
 * @csspart indicator - The animated indicator icon.
 * @csspart text - The status text.
 */
export declare class VioletMessageStatus extends FASTElement {
    status: string;
    constructor();
    defaultText(): string;
}
export type VioletMessageStatusType = "submitted" | "streaming" | "error" | "cancelled" | "retrying";