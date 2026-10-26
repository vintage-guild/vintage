import type { VioletDataGridIdLike } from "./violet-data-grid-selection";
export interface VioletDataGridSizedColumnLike extends VioletDataGridIdLike {
    label: string;
    sortable: boolean;
}
export declare function resolvedColumnWidth(columnId: string, columnWidths: Record<string, string> | null | undefined, sourceColumns: Array<{
    id: string;
    width?: string;
}>): string | undefined;
export declare function inlinePadding(element: Element): number;
export declare function fontForElement(element: Element | null): string;
export declare function measureTextWidth(text: string, font: string, canvas: HTMLCanvasElement | null): number;
export declare function cssLengthToPixels(length: string | undefined): number | null;
export declare function minimumColumnWidth(headerCell: HTMLTableCellElement | null): number;
export declare function renderedColumnWidth(options: {
    headerCell: HTMLTableCellElement | null;
    resolvedWidth: string | undefined;
}): number;
export declare function autosizedColumnWidth<RowLike extends VioletDataGridIdLike>(options: {
    columnId: string;
    column: VioletDataGridSizedColumnLike | null;
    rows: RowLike[];
    headerCell: HTMLTableCellElement | null;
    sampleCell: HTMLTableCellElement | null;
    getCellText: (location: {
        rowId: string;
        columnId: string;
    }) => string;
    sampleRows: RowLike[];
    measurementCanvas: HTMLCanvasElement | null;
}): number;