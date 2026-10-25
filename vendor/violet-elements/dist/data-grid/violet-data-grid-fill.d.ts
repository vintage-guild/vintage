import type { VioletDataGridBoundsLike, VioletDataGridIdLike, VioletDataGridLocationLike } from "./violet-data-grid-selection";
export interface VioletDataGridMatrixCellLike {
    editable: boolean;
    editor?: string;
    rawValue?: unknown;
    text: string;
}
export interface VioletDataGridMatrixRowLike<CellLike extends VioletDataGridMatrixCellLike = VioletDataGridMatrixCellLike> extends VioletDataGridIdLike {
    cells: CellLike[];
}
export interface VioletDataGridMatrixChangeLike {
    rowId: string;
    columnId: string;
    value: unknown;
}
export declare function hasEditableCellsInBounds<CellLike extends VioletDataGridMatrixCellLike>(rows: VioletDataGridMatrixRowLike<CellLike>[], bounds: VioletDataGridBoundsLike | null): boolean;
export declare function isEditableStrip<CellLike extends VioletDataGridMatrixCellLike>(rows: VioletDataGridMatrixRowLike<CellLike>[], rowStart: number, rowEnd: number, columnStart: number, columnEnd: number): boolean;
export declare function clampFillBoundsToEditableTargets<CellLike extends VioletDataGridMatrixCellLike>(rows: VioletDataGridMatrixRowLike<CellLike>[], expandedBounds: VioletDataGridBoundsLike, sourceBounds: VioletDataGridBoundsLike): VioletDataGridBoundsLike;
export declare function buildPasteChanges<CellLike extends VioletDataGridMatrixCellLike>(options: {
    text: string;
    originIndices: {
        rowIndex: number;
        columnIndex: number;
    };
    selection: VioletDataGridBoundsLike | null;
    selectedLocations: VioletDataGridLocationLike[];
    rows: VioletDataGridMatrixRowLike<CellLike>[];
    columns: VioletDataGridIdLike[];
    normalizeValue: (cell: CellLike, value: string) => unknown;
}): VioletDataGridMatrixChangeLike[];
export declare function buildFillChanges<CellLike extends VioletDataGridMatrixCellLike>(options: {
    rows: VioletDataGridMatrixRowLike<CellLike>[];
    columns: VioletDataGridIdLike[];
    sourceBounds: VioletDataGridBoundsLike;
    targetBounds: VioletDataGridBoundsLike;
    normalizeValue: (cell: CellLike, value: string) => unknown;
}): VioletDataGridMatrixChangeLike[];