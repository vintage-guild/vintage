import { FASTElement } from "@lushly-dev/fast-element";
export type VioletIconButtonAppearance = "primary" | "secondary" | "quiet" | "transparent";
/**
 * Violet reusable icon button primitive.
 *
 * @summary Token-driven icon-only button for toolbar, utility, and standalone actions.
 * @slot - Icon or image content for the button.
 * @csspart control - Native button control element.
 * @csspart icon - Inline wrapper for the slotted icon content.
 */
export declare class VioletIconButton extends FASTElement {
    /**
     * Visual emphasis variant for the button.
     */
    appearance: VioletIconButtonAppearance;
    /**
     * Accessible name used for the internal button label.
     */
    label: string;
    /**
     * Native button type forwarded to the internal control.
     */
    type: "button" | "submit" | "reset";
    /**
     * Disables the button.
     */
    disabled: boolean;
    constructor();
}