import { FASTElement } from "@lushly-dev/fast-element";
import "../calendar/violet-calendar";
import "../icon/violet-icon";
export type VioletDateRangePickerSize = "compact" | "natural" | "comfortable";
/**
 * Shared-calendar date range picker.
 *
 * @summary Violet range picker for selecting a start and end date from one calendar surface.
 * @fires input - Emitted when the partial or complete range changes.
 * @fires change - Emitted when the partial or complete range changes.
 * @fires open-change - Emitted when the calendar popup opens or closes.
 */
export declare class VioletDateRangePicker extends FASTElement {
    #private;
    open: boolean;
    label: string;
    supportingText: string;
    errorText: string;
    start: string;
    end: string;
    min: string;
    max: string;
    locale: string;
    required: boolean;
    disabled: boolean;
    invalid: boolean;
    size: VioletDateRangePickerSize;
    readonly triggerId: string;
    readonly labelId: string;
    readonly supportingId: string;
    readonly errorId: string;
    readonly panelId: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get value(): {
        start: string | null;
        end: string | null;
    };
    get describedBy(): string;
    get displayErrorText(): string;
    get startDisplay(): string;
    get endDisplay(): string;
    openChanged(): void;
    toggleOpen(): void;
    show(): void;
    hide(): void;
    handleTriggerKeydown(event: KeyboardEvent): void;
    handleCalendarChange(event: CustomEvent<{
        start?: string;
        end?: string;
    }>): void;
    checkValidity(): boolean;
    private get panelElement();
    private get calendarElement();
}