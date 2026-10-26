export interface VioletCalendarCell {
    iso: string;
    label: string;
    day: number;
    currentMonth: boolean;
    disabled: boolean;
    selected: boolean;
    rangeStart: boolean;
    rangeEnd: boolean;
    inRange: boolean;
    today: boolean;
    tabIndex: number;
}
export declare function createLocalDate(year: number, monthIndex: number, day: number): Date;
export declare function parseIsoDate(value: string | null | undefined): Date | null;
export declare function formatIsoDate(date: Date): string;
export declare function addDays(date: Date, amount: number): Date;
export declare function addMonths(date: Date, amount: number): Date;
export declare function addYears(date: Date, amount: number): Date;
export declare function startOfMonth(date: Date): Date;
export declare function daysInMonth(year: number, monthIndex: number): number;
export declare function clampDate(date: Date, min: string, max: string): Date;
export declare function compareIsoDates(a: string, b: string): number;
export declare function sameCalendarDate(a: Date | null, b: Date | null): boolean;
export declare function resolveWeekStart(locale: string, explicit?: number): number;
export declare function getWeekdayLabels(locale: string, weekStartDay: number): Array<{
    short: string;
    long: string;
}>;
export declare function getMonthLabel(locale: string, date: Date): string;
export declare function formatDisplayDate(locale: string, value: string): string;
export declare function formatDisplayRange(locale: string, start: string, end: string): string;
export declare function buildMonthGrid(options: {
    locale: string;
    monthDate: Date;
    weekStartDay: number;
    value?: string;
    start?: string;
    end?: string;
    focused?: string;
    min?: string;
    max?: string;
    disabledDate?: ((iso: string) => boolean) | null;
}): VioletCalendarCell[][];
export declare function parseTimeValue(value: string | null | undefined): {
    hour: number;
    minute: number;
    second: number;
} | null;
export declare function formatTimeValue(hour: number, minute: number, second?: number, includeSeconds?: boolean): string;