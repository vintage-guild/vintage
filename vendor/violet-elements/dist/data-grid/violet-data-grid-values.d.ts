export type VioletDataGridValueEditor = "text" | "number" | "checkbox" | "select" | "custom";
export interface VioletDataGridValueCellLike<RowData = unknown> {
    editor: VioletDataGridValueEditor;
    rawValue?: unknown;
    rowData: RowData;
    parse?: (value: unknown, row: RowData) => unknown;
}
export type VioletDataGridEditingValueResolution = {
    valid: true;
    value: unknown;
} | {
    valid: false;
    message: string;
};
export declare function editStringForRawValue(rawValue: unknown): string;
export declare function booleanCellValue(value: unknown): boolean;
export declare function normalizedEditingValue<RowData>(cell: VioletDataGridValueCellLike<RowData>, value: unknown): unknown;
export declare function resolveEditingValue<RowData>(cell: VioletDataGridValueCellLike<RowData>, value: unknown): VioletDataGridEditingValueResolution;
export declare function opensOnSingleActiveClick(editor: VioletDataGridValueEditor): boolean;