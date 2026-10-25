export interface VioletDataGridBoundsLike {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
}
export interface VioletDataGridIndicesLike {
    rowIndex: number;
    columnIndex: number;
}
export declare function isCellSelected(selection: VioletDataGridBoundsLike | null, indices: VioletDataGridIndicesLike | null): boolean;
export declare function rangeEdgeForCell(selection: VioletDataGridBoundsLike | null, indices: VioletDataGridIndicesLike | null): string;
export declare function isFillPreviewCell(previewBounds: VioletDataGridBoundsLike | null, sourceBounds: VioletDataGridBoundsLike | null, indices: VioletDataGridIndicesLike | null): boolean;
export declare function resolveCellPartText(basePartText: string, options: {
    selected: boolean;
    rangeEdge: string;
    fillPreview: boolean;
    active: boolean;
    editing: boolean;
}): string;