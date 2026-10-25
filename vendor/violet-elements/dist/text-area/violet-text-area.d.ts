import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable text area primitive.
 *
 * @summary Token-driven multiline text area with built-in label and supporting text.
 * @slot before - Leading inline content such as a note or search affordance.
 * @fires input - Emitted when the value changes while typing.
 * @fires change - Emitted when the value is committed.
 * @csspart field - Field wrapper.
 * @csspart label - Label text element.
 * @csspart control-frame - Framed wrapper around the textarea and leading slot.
 * @csspart before - Leading slot for inline affordances.
 * @csspart control - Native textarea control.
 * @csspart supporting-text - Supporting text element.
 */
export declare class VioletTextArea extends FASTElement {
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
     * Current textarea value.
     */
    value: string;
    /**
     * Optional supporting text shown below the field.
     */
    supportingText: string;
    /**
     * Number of visible rows.
     */
    rows: number;
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