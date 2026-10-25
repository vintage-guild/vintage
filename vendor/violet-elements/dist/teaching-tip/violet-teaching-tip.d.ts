import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
/**
 * Violet reusable teaching tip.
 *
 * @summary Positioned onboarding overlay anchored to a trigger element with title,
 *          body content, optional step indicators, and a close button.
 * @fires open-change - Emitted when the teaching tip opens or closes. Detail: `{ open: boolean }`.
 * @fires dismiss - Emitted when the teaching tip is closed by the user.
 * @slot - Trigger element that the teaching tip anchors to.
 * @slot title - Teaching tip title text.
 * @slot body - Teaching tip body content (alternative to the content attribute).
 * @slot footer - Action buttons area (e.g., Next, Back, Done).
 * @csspart anchor - The wrapper around the trigger slot.
 * @csspart tip - The teaching tip popup element.
 * @csspart header - Header section wrapper.
 * @csspart title - Title text wrapper.
 * @csspart close-button - The dismiss button.
 * @csspart body - Body section wrapper.
 * @csspart footer - Footer section wrapper.
 * @csspart step-indicator - The step counter text.
 */
export declare class VioletTeachingTip extends FASTElement {
    #private;
    hasTitle: boolean;
    hasFooter: boolean;
    content: string;
    positioning: string;
    open: boolean;
    anchor: string;
    noCloseButton: boolean;
    currentStep: number;
    totalSteps: number;
    readonly tipId: string;
    readonly titleId: string;
    constructor();
    show(): void;
    hide(): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    openChanged(): void;
    anchorChanged(): void;
    handleSlotChange(): void;
    handleTitleSlotChange(): void;
    handleFooterSlotChange(): void;
}
export type VioletTeachingTipPositioning = "above" | "below" | "before" | "after";