import { FASTElement } from "@lushly-dev/fast-element";
import { type VioletCalendarCell } from "../date-time/violet-date-utils";
export type VioletCalendarSelectionMode = "single" | "range";
/**
 * Calendar grid primitive for date and range selection.
 *
 * @summary Locale-aware month calendar with keyboard navigation and single/range selection support.
 * @fires input - Emitted when the focused selection changes. Detail: `{ value }` or `{ start, end }`.
 * @fires change - Emitted when a date or range is committed. Detail: `{ value }` or `{ start, end }`.
 * @csspart root - Calendar surface wrapper.
 * @csspart header - Header row with title and nav buttons.
 * @csspart previous-month - Previous month navigation button.
 * @csspart next-month - Next month navigation button.
 * @csspart heading - Visible month and year label.
 * @csspart weekday-row - Weekday header row.
 * @csspart weekday - Weekday header cell.
 * @csspart grid - Calendar grid wrapper.
 * @csspart week - One calendar week row.
 * @csspart day-cell - Grid cell wrapper for a day.
 * @csspart day-button - Interactive day button.
 */
export declare class VioletCalendar extends FASTElement {
    #private;
    monthDate: Date;
    focusedDate: string;
    weekStartDay: number;
    selectionMode: VioletCalendarSelectionMode;
    locale: string;
    value: string;
    start: string;
    end: string;
    min: string;
    max: string;
    disabled: boolean;
    disabledDates: ((iso: string) => boolean) | null;
    constructor();
    connectedCallback(): void;
    get resolvedLocale(): string;
    get resolvedWeekStartDay(): number;
    get weekdayLabels(): Array<{
        short: string;
        long: string;
    }>;
    get monthLabel(): string;
    get weeks(): VioletCalendarCell[][];
    valueChanged(): void;
    startChanged(): void;
    endChanged(): void;
    localeChanged(): void;
    showPreviousMonth(): void;
    showNextMonth(): void;
    handleDayFocus(iso: string): void;
    handleDayFocusEvent(event: Event): void;
    handleGridFocusIn(event: Event): void;
    handleDaySelect(iso: string): void;
    handleDaySelectEvent(event: Event): void;
    handleGridClick(event: Event): void;
    handleGridKeydown(event: KeyboardEvent): void;
}