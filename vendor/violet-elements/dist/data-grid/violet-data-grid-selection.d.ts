export interface VioletDataGridIdLike {
    id: string;
}
export interface VioletDataGridLocationLike {
    rowId: string;
    columnId: string;
}
export interface VioletDataGridRangeLike<LocationLike extends VioletDataGridLocationLike = VioletDataGridLocationLike> {
    anchor: LocationLike;
    focus: LocationLike;
}
export interface VioletDataGridBoundsLike {
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
}
export declare function cellIndicesForLocation(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], location: VioletDataGridLocationLike): {
    rowIndex: number;
    columnIndex: number;
} | null;
export declare function locationForIndices(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], rowIndex: number, columnIndex: number): VioletDataGridLocationLike | null;
export declare function boundsForRange(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], range: VioletDataGridRangeLike | null): VioletDataGridBoundsLike | null;
export declare function rangeFromBounds(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], bounds: VioletDataGridBoundsLike): VioletDataGridRangeLike | null;
export declare function selectedLocations(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], selection: VioletDataGridBoundsLike | null, activeCell: VioletDataGridLocationLike | null): VioletDataGridLocationLike[];
export declare function nextTabLocation(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], current: VioletDataGridLocationLike, direction: -1 | 1): VioletDataGridLocationLike | null;
export declare function locationWithinBounds(rows: VioletDataGridIdLike[], columns: VioletDataGridIdLike[], location: VioletDataGridLocationLike, bounds: VioletDataGridBoundsLike): boolean;