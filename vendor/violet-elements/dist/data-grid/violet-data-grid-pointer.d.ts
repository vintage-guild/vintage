export interface VioletDataGridPointerSelectionSession<Location> {
    anchor: Location | null;
    pointerId: number | null;
    moved: boolean;
}
export interface VioletDataGridFillSession<Range> {
    pointerId: number | null;
    sourceRange: Range | null;
}
export declare function beginPointerSelection<Location>(pointerId: number, anchor: Location): VioletDataGridPointerSelectionSession<Location>;
export declare function isPointerSelectionEventForSession<Location>(session: VioletDataGridPointerSelectionSession<Location>, pointerId: number): boolean;
export declare function markPointerSelectionMoved<Location>(session: VioletDataGridPointerSelectionSession<Location>): VioletDataGridPointerSelectionSession<Location>;
export declare function clearedPointerSelectionSession<Location>(): VioletDataGridPointerSelectionSession<Location>;
export declare function pointerSelectionSuppressesNextClick<Location>(session: VioletDataGridPointerSelectionSession<Location>, suppressRequested: boolean): boolean;
export declare function beginFillDrag<Range>(pointerId: number, sourceRange: Range | null): VioletDataGridFillSession<Range> | null;
export declare function isFillPointerEventForSession<Range>(session: VioletDataGridFillSession<Range>, pointerId: number): boolean;
export declare function clearedFillSession<Range>(): VioletDataGridFillSession<Range>;