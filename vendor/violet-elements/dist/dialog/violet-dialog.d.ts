import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
/**
 * Violet reusable dialog surface.
 *
 * @summary Token-driven dialog built on the native <dialog> element with modal/non-modal/alert types,
 *          CSS open/close animations, header/footer slots, and adjustable padding.
 * @fires open-change - Emitted after the dialog opens or closes.
 * @fires request-close - Emitted before close. Call preventDefault() to cancel.
 * @slot title - Dialog title text, auto-wired to aria-labelledby.
 * @slot - Dialog body content.
 * @slot footer - Action buttons area.
 * @csspart dialog - The native dialog element.
 * @csspart header - Header section wrapper.
 * @csspart title - Title text wrapper.
 * @csspart close-button - The X close button.
 * @csspart body - Body section wrapper.
 * @csspart footer - Footer section wrapper.
 */
export declare class VioletDialog extends FASTElement {
    #private;
    hasTitle: boolean;
    hasFooter: boolean;
    open: boolean;
    type: string;
    padding: string;
    noCloseButton: boolean;
    noBackdrop: boolean;
    readonly dialogId: string;
    readonly titleId: string;
    constructor();
    get returnValue(): string;
    set returnValue(value: string);
    show(): void;
    hide(returnValue?: string): void;
    openChanged(): void;
    typeChanged(): void;
    connectedCallback(): void;
    handleClose(_event: Event): void;
    handleCancel(event: Event): void;
    requestClose(source: "close-button" | "keyboard" | "overlay"): void;
    handleTitleSlotChange(): void;
    handleFooterSlotChange(): void;
}
export type VioletDialogType = "modal" | "non-modal" | "alert";