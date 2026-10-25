import { FASTElement } from "@lushly-dev/fast-element";
export type VioletRangeSliderOrientation = "horizontal" | "vertical";
/**
 * Violet reusable range slider primitive with two thumbs.
 *
 * @summary Token-driven native-first dual-thumb range input with Violet rail, fill, thumbs, label, and supporting/error text.
 * @fires input - Emitted when either thumb value changes while dragging or using the keyboard.
 * @fires change - Emitted when either thumb value is committed.
 * @csspart field - Field wrapper.
 * @csspart label - Slider label text.
 * @csspart control-shell - Slider control wrapper.
 * @csspart input-start - Native range input for the lower thumb.
 * @csspart input-end - Native range input for the upper thumb.
 * @csspart visual - Visual wrapper for the custom rail and thumbs.
 * @csspart rail - Resting slider rail.
 * @csspart fill - Active filled portion of the rail between the two thumbs.
 * @csspart ticks - Tick marks along the rail.
 * @csspart thumb-start - Lower thumb.
 * @csspart thumb-end - Upper thumb.
 * @csspart supporting-text - Supporting helper text.
 * @csspart error-message - Visible error text.
 */
export declare class VioletRangeSlider extends FASTElement {
    #private;
    static readonly formAssociated = true;
    readonly inputStartId: string;
    readonly inputEndId: string;
    readonly supportingTextId: string;
    readonly errorTextId: string;
    label: string;
    supportingText: string;
    errorText: string;
    valueStart: string;
    valueEnd: string;
    min: string;
    max: string;
    step: string;
    name: string;
    labelStart: string;
    labelEnd: string;
    required: boolean;
    disabled: boolean;
    invalid: boolean;
    showTicks: boolean;
    orientation: VioletRangeSliderOrientation;
    constructor();
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    connectedCallback(): void;
    formResetCallback(): void;
    valueStartChanged(): void;
    valueEndChanged(): void;
    minChanged(): void;
    maxChanged(): void;
    stepChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    orientationChanged(): void;
    get validationMessageText(): string;
    get describedByIds(): string;
    get value(): string;
    get controlStyle(): string;
    get tickStyle(): string;
    handleInput(event: Event): void;
    handleCommit(event: Event): void;
    handlePointerDown(event: PointerEvent, thumb: "start" | "end"): void;
    disconnectedCallback(): void;
    get minAsNumber(): number;
    get maxAsNumber(): number;
    get stepAsNumber(): number;
    get valueStartAsNumber(): number;
    get valueEndAsNumber(): number;
    get startPercent(): string;
    get endPercent(): string;
    get midPercent(): string;
}