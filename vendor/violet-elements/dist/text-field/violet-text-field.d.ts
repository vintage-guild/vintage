import { FASTElement } from "@lushly-dev/fast-element";
export type VioletTextFieldType = "text" | "search" | "email" | "url" | "password" | "tel";
/**
 * Violet reusable text field primitive.
 *
 * @summary Token-driven single-line text input with built-in label and supporting text.
 * @slot before - Leading inline content such as a search or password icon.
 * @fires input - Emitted when the value changes while typing.
 * @fires change - Emitted when the value is committed.
 * @csspart field - Field wrapper.
 * @csspart label - Label text element.
 * @csspart control-frame - Framed wrapper around the input and leading slot.
 * @csspart before - Leading slot for inline affordances.
 * @csspart control - Native input control.
 * @csspart supporting-text - Supporting text element.
 */
export declare class VioletTextField extends FASTElement {
    #private;
    static readonly formAssociated = true;
    readonly inputId: string;
    /**
     * Optional field label.
     */
    label: string;
    /**
     * Optional placeholder text.
     */
    placeholder: string;
    /**
     * Current input value.
     */
    value: string;
    /**
     * Native input type.
     */
    type: VioletTextFieldType;
    /**
     * Optional supporting text shown below the field.
     */
    supportingText: string;
    /**
     * Disables the field.
     */
    disabled: boolean;
    /**
     * Marks the field readonly.
     */
    readonly: boolean;
    /**
     * Marks the field invalid.
     */
    invalid: boolean;
    /**
     * Native form name used during submission.
     */
    name: string;
    /**
     * Marks the field as required.
     */
    required: boolean;
    constructor();
    connectedCallback(): void;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    formResetCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    valueChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    readonlyChanged(): void;
    requiredChanged(): void;
}