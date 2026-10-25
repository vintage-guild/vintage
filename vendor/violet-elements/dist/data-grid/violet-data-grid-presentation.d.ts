import type { ContentTemplate } from "@lushly-dev/fast-element";
export interface VioletPresentationIdLike {
    id: string;
}
export interface VioletPresentationLocationLike {
    rowId: string;
    columnId: string;
}
export interface VioletPresentationRangeLike<LocationLike extends VioletPresentationLocationLike = VioletPresentationLocationLike> {
    anchor: LocationLike;
    focus: LocationLike;
}
export interface VioletPresentationCellLike {
    rowId: string;
    columnId: string;
    cellPartText: string;
    active: boolean;
    selected: boolean;
    fillPreview: boolean;
    rangeEdge: string;
    editing: boolean;
    editValue: string;
    editingError: string;
    editingErrorId: string;
    resolvedCellPartText: string;
}
export interface VioletPresentationRowLike<CellLike extends VioletPresentationCellLike = VioletPresentationCellLike> {
    cells: CellLike[];
}
export interface VioletPresentationSourceColumnLike<RowData = unknown> {
    id: string;
    label: string;
    sortable?: boolean;
    width?: string;
    align?: "start" | "center" | "end";
    headerPart?: string;
    cellPart?: string;
    editable?: boolean;
    editor?: "text" | "number" | "checkbox" | "select" | "custom";
    cellTemplate?: ContentTemplate;
    editorTemplate?: ContentTemplate;
    parse?: (value: unknown, row: RowData) => unknown;
}
export interface VioletPresentationColumnLike<RowData = unknown> {
    id: string;
    label: string;
    sortable: boolean;
    width?: string;
    widthStyle: string;
    align: "start" | "center" | "end";
    headerPart?: string;
    headerPartText: string;
    cellPart?: string;
    cellPartText: string;
    source: VioletPresentationSourceColumnLike<RowData>;
}
export interface VioletPresentationSourceRowLike<RowData = unknown> {
    id: string;
    label?: string;
    data: RowData;
}
export declare function isValidCellLocation(rows: VioletPresentationIdLike[], columns: VioletPresentationIdLike[], location: VioletPresentationLocationLike | null): location is VioletPresentationLocationLike;
export declare function syncActiveCell(options: {
    focusMode: "row" | "cell";
    rows: VioletPresentationIdLike[];
    columns: VioletPresentationIdLike[];
    activeCell: VioletPresentationLocationLike | null;
}): VioletPresentationLocationLike | null;
export declare function syncCellSelection<LocationLike extends VioletPresentationLocationLike = VioletPresentationLocationLike>(options: {
    focusMode: "row" | "cell";
    activeCell: LocationLike | null;
    cellSelection: VioletPresentationRangeLike<LocationLike> | null;
    isValidLocation: (location: LocationLike | null) => boolean;
}): VioletPresentationRangeLike<LocationLike> | null;
export declare function syncFillPreview<LocationLike extends VioletPresentationLocationLike = VioletPresentationLocationLike>(options: {
    focusMode: "row" | "cell";
    fillPreview: VioletPresentationRangeLike<LocationLike> | null;
    isValidLocation: (location: LocationLike | null) => boolean;
}): VioletPresentationRangeLike<LocationLike> | null;
export declare function syncEditingState<LocationLike extends VioletPresentationLocationLike = VioletPresentationLocationLike>(options: {
    focusMode: "row" | "cell";
    editingCell: LocationLike | null;
    editingValue: string;
    isEditableLocation: (location: LocationLike | null) => boolean;
}): {
    editingCell: LocationLike | null;
    editingValue: string;
};
export declare function withInteractionState<RowLike extends VioletPresentationRowLike<CellLike>, CellLike extends VioletPresentationCellLike>(row: RowLike, options: {
    isActiveCell: (rowId: string, columnId: string) => boolean;
    isCellSelected: (rowId: string, columnId: string) => boolean;
    isFillPreviewCell: (rowId: string, columnId: string) => boolean;
    rangeEdgeForCell: (rowId: string, columnId: string) => string;
    isEditingCell: (rowId: string, columnId: string) => boolean;
    editingValue: string;
    editingError: string;
    resolveCellPartText: (rowId: string, columnId: string, basePartText: string) => string;
}): RowLike;
export declare function createPresentedColumn<RowData>(column: VioletPresentationSourceColumnLike<RowData>, options: {
    resolvedWidth: string | undefined;
    mergePartNames: (base: string, extra?: string) => string;
}): VioletPresentationColumnLike<RowData>;
export declare function createPresentedRow<RowData, EditorOption>(row: VioletPresentationSourceRowLike<RowData>, columns: VioletPresentationColumnLike<RowData>[], options: {
    cellValueFor: (row: VioletPresentationSourceRowLike<RowData>, column: VioletPresentationColumnLike<RowData>) => unknown;
    serializeCellValue: (column: VioletPresentationSourceColumnLike<RowData>, rowData: RowData, rawValue: unknown) => string;
    cellIdFor: (rowId: string, columnId: string) => string;
    editingErrorIdFor: (rowId: string, columnId: string) => string;
    editorOptionsForColumn: (column: VioletPresentationSourceColumnLike<RowData>, rowData: RowData) => EditorOption[];
}): {
    id: string;
    label: string;
    data: RowData;
    cells: Array<{
        rowId: string;
        rowLabel: string;
        columnId: string;
        columnLabel: string;
        rowData: RowData;
        align: "start" | "center" | "end";
        rawValue: unknown;
        text: string;
        widthStyle: string;
        cellId: string;
        active: boolean;
        selected: boolean;
        rangeEdge: string;
        editable: boolean;
        editor: "text" | "number" | "checkbox" | "select" | "custom";
        editing: boolean;
        editValue: string;
        editingError: string;
        editingErrorId: string;
        fillPreview: boolean;
        cellPart?: string;
        cellPartText: string;
        resolvedCellPartText: string;
        cellTemplate?: ContentTemplate;
        editorTemplate?: ContentTemplate;
        editorOptions: EditorOption[];
        parse?: (value: unknown, row: RowData) => unknown;
    }>;
};