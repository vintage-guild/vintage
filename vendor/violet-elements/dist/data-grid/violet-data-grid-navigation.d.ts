export interface VioletDataGridNavigationLocationLike {
    rowId: string;
    columnId: string;
}
export interface VioletDataGridNavigationRowLike {
    id: string;
}
export interface VioletDataGridNavigationColumnLike {
    id: string;
}
export interface VioletDataGridCellRangeLike<Location> {
    anchor: Location;
    focus: Location;
}
export declare function firstCellLocation<RowLike extends VioletDataGridNavigationRowLike, ColumnLike extends VioletDataGridNavigationColumnLike>(rows: RowLike[], columns: ColumnLike[]): {
    rowId: string;
    columnId: string;
} | null;
export declare function createCellSelection<Location extends VioletDataGridNavigationLocationLike>(anchor: Location, focus: Location): VioletDataGridCellRangeLike<Location> | null;
export declare function nextCellLocationForKey<RowLike extends VioletDataGridNavigationRowLike, ColumnLike extends VioletDataGridNavigationColumnLike>(options: {
    rows: RowLike[];
    columns: ColumnLike[];
    activeCell: VioletDataGridNavigationLocationLike | null;
    key: string;
    metaKey: boolean;
}): {
    rowId: string;
    columnId: string;
} | null;