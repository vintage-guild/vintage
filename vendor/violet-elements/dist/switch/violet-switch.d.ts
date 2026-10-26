import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable switch primitive.
 *
 * @summary Token-driven binary switch with label, inline mode, and form participation.
 * @fires change - Emitted when the checked state changes.
 * @slot - Switch label content.
 * @slot supporting - Optional supporting copy rendered under the label.
 * @csspart root - Root switch wrapper.
 * @csspart input - Native checkbox input carrying switch semantics.
 * @csspart control - Visible switch track.
 * @csspart thumb - Switch thumb inside the track.
 * @csspart label - Primary label text wrapper.
 * @csspart supporting-text - Optional supporting text wrapper.
 */
export declare class VioletSwitch extends FASTElement {
    #private;
    static readonly formAssociated = true;
    hasSupporting: boolean;
    hasLabel: boolean;
    checked: boolean;
    disabled: boolean;
    inline: boolean;
    invalid: boolean;
    name: string;
    value: string;
    required: boolean;
    readonly controlId: string;
    readonly supportingTextId: string;
    constructor();
    connectedCallback(): void;
    handleChange(event: Event): void;
    handleTrackClick(): void;
    handleDefaultSlotChange(): void;
    handleSupportingSlotChange(): void;
    formResetCallback(): void;
    get explicitAriaLabel(): string | null;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    checkedChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    requiredChanged(): void;
    valueChanged(): void;
    nameChanged(): void;
}