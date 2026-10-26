import { FASTElement } from "@lushly-dev/fast-element";
import "../radio/violet-radio";
import type { VioletRadio } from "../radio/violet-radio";
export type VioletRadioGroupOrientation = "horizontal" | "vertical";
/**
 * Violet reusable radio group primitive.
 *
 * @summary Token-driven form-associated radio group with roving focus and optional label/supporting text.
 * @fires change - Emitted when the selected value changes.
 * @slot - Radio options rendered inside the group.
 * @csspart field - Field wrapper.
 * @csspart label - Group label text element.
 * @csspart group - Layout wrapper for slotted radios.
 * @csspart supporting-text - Supporting text element.
 */
export declare class VioletRadioGroup extends FASTElement {
    #private;
    static readonly formAssociated = true;
    radios: VioletRadio[];
    validationMessageText: string;
    /**
     * Optional field label.
     */
    label: string;
    /**
     * Optional supporting text shown below the group.
     */
    supportingText: string;
    /**
     * Optional visible error copy used when the group is invalid.
     */
    errorText: string;
    /**
     * Selected radio value.
     */
    value: string;
    /**
     * Native group name forwarded to child radios and form submission.
     */
    name: string;
    /**
     * Disables the radio group and child radios.
     */
    disabled: boolean;
    /**
     * Marks the group invalid.
     */
    invalid: boolean;
    /**
     * Marks the group required.
     */
    required: boolean;
    /**
     * Layout orientation for the group.
     */
    orientation: VioletRadioGroupOrientation;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    formResetCallback(): void;
    handleSlotChange(): void;
    radiosChanged(): void;
    labelChanged(): void;
    supportingTextChanged(): void;
    errorTextChanged(): void;
    valueChanged(): void;
    nameChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    requiredChanged(): void;
    orientationChanged(): void;
    handleRadioChange: (event: Event) => void;
    handleKeydown: (event: KeyboardEvent) => void;
}