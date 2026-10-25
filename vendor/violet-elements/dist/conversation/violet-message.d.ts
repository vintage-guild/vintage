import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet message surface.
 *
 * @summary Message chrome with role-based styling (user/assistant/system),
 *          tone variants, avatar and meta slots. Does not render content
 *          directly — message parts are slotted into the body.
 * @slot avatar - Optional avatar/icon for the message author.
 * @slot meta - Optional metadata row (timestamp, model name, etc.).
 * @slot - Message parts (text, tool cards, media, etc.).
 * @csspart root - The outer article element.
 * @csspart avatar - The avatar wrapper.
 * @csspart surface - The message card surface.
 * @csspart meta - The metadata row.
 * @csspart body - The body content area.
 */
export declare class VioletMessage extends FASTElement {
    hasAvatar: boolean;
    hasMeta: boolean;
    messageRole: string;
    tone: string;
    streaming: boolean;
    constructor();
    handleAvatarSlotChange(): void;
    handleMetaSlotChange(): void;
}
export type VioletMessageRole = "user" | "assistant" | "system";
export type VioletMessageTone = "default" | "muted" | "error" | "success";