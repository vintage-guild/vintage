import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet message text part.
 *
 * @summary Renders a text part from a UIMessage with optional streaming
 *          cursor indicator. Maps to TanStack AI TextPart / AI SDK TextUIPart.
 * @slot - Text content (plain text or pre-sanitized HTML).
 * @csspart text - The text container.
 * @csspart cursor - The blinking cursor shown during streaming.
 */
export declare class VioletMessageText extends FASTElement {
    state: string;
    constructor();
}
export type VioletMessageTextState = "streaming" | "done";