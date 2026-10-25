export interface VioletDataGridLocationLike {
    rowId: string;
    columnId: string;
}
export declare function locationFromCellElement(cell: HTMLTableCellElement): VioletDataGridLocationLike | null;
export declare function nearestLocationForPoint(options: {
    cells: HTMLTableCellElement[];
    clientX: number;
    clientY: number;
    predicate?: (location: VioletDataGridLocationLike) => boolean;
}): VioletDataGridLocationLike | null;
export declare function preferredAxisForPoint(clientX: number, clientY: number, sourceRect: DOMRect | null): "horizontal" | "vertical" | null;
export declare function rectFromCellPair(startCell: HTMLTableCellElement | null, endCell: HTMLTableCellElement | null): DOMRect | null;