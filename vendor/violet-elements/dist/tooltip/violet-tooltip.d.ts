import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable tooltip.
 *
 * @summary Token-driven tooltip using popover="hint" and CSS Anchor Positioning.
 *          Wraps a trigger element (default slot) and shows supplemental text on hover/focus.
 * @slot - Trigger element that the tooltip anchors to.
 * @slot content - Rich tooltip content (alternative to the content attribute).
 * @csspart anchor - The wrapper around the trigger slot that serves as the CSS anchor.
 * @csspart tooltip - The tooltip popup element.
 */
export declare class VioletTooltip extends FASTElement {
    #private;
    content: string;
    positioning: string;
    delay: number;
    open: boolean;
    anchor: string;
    readonly tooltipId: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    openChanged(): void;
    anchorChanged(): void;
    handleSlotChange(): void;
}
export type VioletTooltipPositioning = "above" | "below" | "before" | "after";