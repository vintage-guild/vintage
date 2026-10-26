import type { VioletGanttDate, VioletGanttTime } from "./violet-gantt";
export interface VioletGanttClippedGeometry {
    left: number;
    width: number;
    clippedStart: boolean;
    clippedEnd: boolean;
    point: boolean;
}
export declare function ganttDateToDay(value: VioletGanttDate): number | null;
export declare function ganttDayToDate(day: number): VioletGanttDate;
export declare function ganttTimeBounds(time: VioletGanttTime): {
    start: number;
    endExclusive: number;
    point: boolean;
} | null;
export declare function ganttTimeIntersects(time: VioletGanttTime, viewportStart: number, viewportEndExclusive: number): boolean;
export declare function ganttClippedGeometry(time: VioletGanttTime, viewportStart: number, viewportEndExclusive: number, dayWidth: number): VioletGanttClippedGeometry | null;
export declare function ganttAddDays(value: VioletGanttDate, amount: number): VioletGanttDate | null;