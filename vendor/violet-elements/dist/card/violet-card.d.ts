import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable card surface.
 *
 * @summary Token-driven card frame with optional padding, appearance variants, header/footer slots, and interactive mode.
 * @slot - Card body content.
 * @slot header - Optional header area rendered above the body with a separator border.
 * @slot footer - Optional footer area rendered below the body with a separator border.
 * @csspart root - Card container.
 * @csspart header - Header section wrapper.
 * @csspart body - Body section wrapper.
 * @csspart footer - Footer section wrapper.
 */
export declare class VioletCard extends FASTElement {
    #private;
    hasHeader: boolean;
    hasFooter: boolean;
    padding: string;
    appearance: string;
    interactive: boolean;
    orientation: string;
    constructor();
    connectedCallback(): void;
    interactiveChanged(): void;
    handleHeaderSlotChange(): void;
    handleFooterSlotChange(): void;
}
export type VioletCardPadding = "none" | "small" | "medium" | "large";
export type VioletCardAppearance = "filled" | "outline" | "subtle";
export type VioletCardOrientation = "vertical" | "horizontal";