export interface VioletDataGridDataColumnLike<RowData = unknown> {
    id: string;
    sortable?: boolean;
    editor?: string;
    render?: (rowData: RowData) => unknown;
    value?: (rowData: RowData) => unknown;
    serialize?: (rawValue: unknown, rowData: RowData) => string;
    editorOptions?: unknown[] | ((rowData: RowData) => unknown[]);
}
export interface VioletDataGridDataRowLike<RowData = unknown> {
    id: string;
    data: RowData;
}
export interface VioletDataGridSortLike {
    columnId: string;
    direction: "ascending" | "descending";
}
export declare function cellValueFor<RowData>(row: VioletDataGridDataRowLike<RowData>, column: VioletDataGridDataColumnLike<RowData>): unknown;
export declare function editorOptionsForColumn<RowData, Option>(column: VioletDataGridDataColumnLike<RowData>, rowData: RowData): Option[];
export declare function stringifyUnknown(value: unknown): string;
export declare function stringifyCellValue(rawValue: unknown): string;
export declare function serializeCellValue<RowData>(options: {
    column: VioletDataGridDataColumnLike<RowData>;
    rowData: RowData;
    rawValue: unknown;
    booleanCellValue: (value: unknown) => boolean;
}): string;
export declare function sortRows<RowData>(options: {
    rows: VioletDataGridDataRowLike<RowData>[] | undefined;
    columns: VioletDataGridDataColumnLike<RowData>[];
    sort: VioletDataGridSortLike | null;
    sortMode: "local" | "external";
    getSortKey?: (row: VioletDataGridDataRowLike<RowData>, column: VioletDataGridDataColumnLike<RowData>) => string;
}): VioletDataGridDataRowLike<RowData>[];