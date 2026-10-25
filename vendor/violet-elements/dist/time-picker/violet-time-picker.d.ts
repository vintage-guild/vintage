import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
export type VioletTimePickerSize = "compact" | "natural" | "comfortable";
/**
 * Native-backed time field with Violet shell styling.
 *
 * @summary Time picker wrapper around the native time input for form and keyboard parity.
 * @fires input - Emitted when the time value changes while editing.
 * @fires change - Emitted when the time value is committed.
 */
export declare class VioletTimePicker extends FASTElement {
    #private;
    static readonly formAssociated = true;
    validationMessageText: string;
    label: string;
    supportingText: string;
    errorText: string;
    value: string;
    name: string;
    min: string;
    max: string;
    step: string;
    required: boolean;
    disabled: boolean;
    invalid: boolean;
    size: VioletTimePickerSize;
    readonly inputId: string;
    readonly supportingId: string;
    readonly errorId: string;
    constructor();
    connectedCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    get describedBy(): string;
    get displayErrorText(): string;
    get stepValue(): string;
    valueChanged(): void;
    invalidChanged(): void;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    formResetCallback(): void;
    checkValidity(): boolean;
    reportValidity(): boolean;
    private get inputElement();
}