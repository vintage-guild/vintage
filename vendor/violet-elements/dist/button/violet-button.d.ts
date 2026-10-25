import { FASTElement } from "@lushly-dev/fast-element";
export type VioletButtonAppearance = "primary" | "secondary" | "quiet" | "transparent";
/**
 * Violet reusable button primitive.
 *
 * @summary Token-driven action button for primary, secondary, quiet, and transparent actions.
 * @slot before - Leading inline content such as an icon.
 * @slot - Button label content.
 * @slot after - Trailing inline content such as a status glyph.
 * @csspart control - Native button control element.
 * @csspart before - Leading slot wrapper.
 * @csspart label - Inline label wrapper.
 * @csspart after - Trailing slot wrapper.
 */
export declare class VioletButton extends FASTElement {
    #private;
    /**
     * Visual emphasis variant for the button.
     */
    appearance: VioletButtonAppearance;
    /**
     * Native button type forwarded to the internal control.
     */
    type: "button" | "submit" | "reset";
    /**
     * Disables the button.
     */
    disabled: boolean;
    /**
     * Optional accessible name override forwarded to the inner button.
     */
    ariaLabel: string;
    /**
     * Optional labelledby reference forwarded to the inner button.
     */
    ariaLabelledby: string;
    /**
     * Optional describedby reference forwarded to the inner button.
     */
    ariaDescribedby: string;
    /**
     * Optional errormessage reference forwarded to the inner button.
     */
    ariaErrormessage: string;
    /**
     * Optional controls reference forwarded to the inner button.
     */
    ariaControls: string | null;
    /**
     * Optional expanded state forwarded to the inner button.
     */
    ariaExpanded: string | null;
    /**
     * Optional popup type forwarded to the inner button.
     */
    ariaHasPopup: string | null;
    constructor();
    private ariaControlsChanged;
    private ariaExpandedChanged;
    private ariaHasPopupChanged;
}