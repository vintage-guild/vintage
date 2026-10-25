import { FASTElement } from "@lushly-dev/fast-element";
export type VioletSliderOrientation = "horizontal" | "vertical";
/**
 * Violet reusable slider primitive.
 *
 * @summary Token-driven native-first range input with Violet rail, thumb, label, and supporting/error text.
 * @fires input - Emitted when the slider value changes while dragging or using the keyboard.
 * @fires change - Emitted when the slider value is committed.
 * @csspart field - Field wrapper.
 * @csspart label - Slider label text.
 * @csspart control-shell - Slider control wrapper.
 * @csspart input - Native range input carrying semantics.
 * @csspart visual - Visual wrapper for the custom rail and thumb.
 * @csspart rail - Resting slider rail.
 * @csspart fill - Active filled portion of the rail.
 * @csspart thumb - Slider thumb.
 * @csspart supporting-text - Supporting helper text.
 * @csspart error-message - Visible error text.
 */
export declare class VioletSlider extends FASTElement {
    #private;
    static readonly formAssociated = true;
    readonly inputId: string;
    readonly supportingTextId: string;
    readonly errorTextId: string;
    label: string;
    supportingText: string;
    errorText: string;
    valueText: string;
    value: string;
    min: string;
    max: string;
    step: string;
    name: string;
    required: boolean;
    orientation: VioletSliderOrientation;
    disabled: boolean;
    invalid: boolean;
    showFill: boolean;
    showTicks: boolean;
    constructor();
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    connectedCallback(): void;
    formResetCallback(): void;
    nameChanged(): void;
    valueChanged(): void;
    minChanged(): void;
    maxChanged(): void;
    stepChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    orientationChanged(): void;
    get validationMessageText(): string;
    get describedByIds(): string;
    get controlStyle(): string;
    get tickStyle(): string;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    handlePointerDown(event: PointerEvent): void;
    disconnectedCallback(): void;
    get minAsNumber(): number;
    get maxAsNumber(): number;
    get stepAsNumber(): number;
    get valueAsNumber(): number;
    get percent(): string;
}