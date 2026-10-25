import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable checkbox primitive.
 *
 * @summary Token-driven checkbox with label, inline selection mode, and indeterminate support.
 * @fires change - Emitted when the checked state changes.
 * @slot - Checkbox label content.
 * @slot supporting - Optional supporting copy rendered under the label.
 * @csspart root - Root label wrapper.
 * @csspart input - Native checkbox input.
 * @csspart control - Visible checkbox control box.
 * @csspart mark - Checkmark glyph inside the control.
 * @csspart label - Primary label text wrapper.
 * @csspart supporting-text - Optional supporting text wrapper.
 */
export declare class VioletCheckbox extends FASTElement {
    #private;
    static readonly formAssociated = true;
    hasSupporting: boolean;
    hasLabel: boolean;
    /**
     * Checked state for the checkbox.
     */
    checked: boolean;
    /**
     * Mixed selection state for aggregate checkboxes.
     */
    indeterminate: boolean;
    /**
     * Disables the checkbox.
     */
    disabled: boolean;
    /**
     * Presents a compact inline layout that can collapse to the control only.
     */
    inline: boolean;
    /**
     * Marks the checkbox as invalid.
     */
    invalid: boolean;
    /**
     * Native form name used during submission.
     */
    name: string;
    /**
     * Native submitted value when checked.
     */
    value: string;
    /**
     * Marks the checkbox as required.
     */
    required: boolean;
    constructor();
    connectedCallback(): void;
    handleChange(event: Event): void;
    handleDefaultSlotChange(): void;
    handleSupportingSlotChange(): void;
    formResetCallback(): void;
    get controlAriaLabel(): string | null;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    checkedChanged(): void;
    indeterminateChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    requiredChanged(): void;
    valueChanged(): void;
    nameChanged(): void;
}