import { FASTElement } from "@lushly-dev/fast-element";
import "../calendar/violet-calendar";
import "../icon/violet-icon";
export type VioletDatePickerSize = "compact" | "natural" | "comfortable";
/**
 * Locale-aware date field with calendar popup selection.
 *
 * @summary Violet date picker composed from the field shell and calendar primitive.
 * @fires input - Emitted when the date value changes while editing or selecting.
 * @fires change - Emitted when the date value is committed.
 * @fires open-change - Emitted when the calendar popup opens or closes.
 */
export declare class VioletDatePicker extends FASTElement {
    #private;
    static readonly formAssociated = true;
    open: boolean;
    validationMessageText: string;
    label: string;
    supportingText: string;
    errorText: string;
    value: string;
    name: string;
    required: boolean;
    disabled: boolean;
    invalid: boolean;
    min: string;
    max: string;
    locale: string;
    size: VioletDatePickerSize;
    readonly inputId: string;
    readonly supportingId: string;
    readonly errorId: string;
    readonly panelId: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    get displayValue(): string;
    get describedBy(): string;
    get displayErrorText(): string;
    valueChanged(): void;
    invalidChanged(): void;
    openChanged(): void;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    handleInputKeydown(event: KeyboardEvent): void;
    handleCalendarChange(event: CustomEvent<{
        value?: string;
    }>): void;
    show(): void;
    hide(): void;
    toggleOpen(): void;
    formResetCallback(): void;
    checkValidity(): boolean;
    reportValidity(): boolean;
    private get inputElement();
    private get panelElement();
    private get calendarElement();
}