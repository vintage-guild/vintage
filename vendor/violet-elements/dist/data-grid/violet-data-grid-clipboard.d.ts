export interface VioletDataGridLocationLike {
    rowId: string;
    columnId: string;
}
export interface VioletDataGridBoundsLike {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
}
export interface VioletDataGridIdRowLike {
    id: string;
}
export interface VioletDataGridIdColumnLike {
    id: string;
}
export declare function sampleAutosizeRows<RowLike>(rows: RowLike[]): RowLike[];
export declare function copyTextForSelection(options: {
    selection: VioletDataGridBoundsLike | null;
    locations: VioletDataGridLocationLike[];
    rows: VioletDataGridIdRowLike[];
    columns: VioletDataGridIdColumnLike[];
    getCellText: (location: VioletDataGridLocationLike) => string;
}): string;
export declare function normalizePastedText(text: string): string;
export declare function resolvePasteOriginLocation(options: {
    selection: VioletDataGridBoundsLike | null;
    rows: VioletDataGridIdRowLike[];
    columns: VioletDataGridIdColumnLike[];
    activeCell: VioletDataGridLocationLike | null;
}): VioletDataGridLocationLike | null;