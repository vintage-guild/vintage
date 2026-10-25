import type { VirtualItem } from "@tanstack/virtual-core";
export interface VioletVirtualizedRowLike {
    id: string;
}
export interface VioletRenderedVirtualRow<RowLike, ItemLike extends Pick<VirtualItem, "index">> {
    item: ItemLike;
    row: RowLike;
}
export declare function buildRenderedRows<RowLike extends VioletVirtualizedRowLike, ItemLike extends VirtualItem>(options: {
    virtualize: boolean;
    rows: RowLike[];
    estimatedRowHeight: number;
    virtualItems: ItemLike[];
    totalSize: number;
}): {
    renderedRows: VioletRenderedVirtualRow<RowLike, ItemLike | VirtualItem>[];
    virtualPaddingStart: number;
    virtualPaddingEnd: number;
};
export declare function buildVirtualizerUpdateOptions<RowLike extends VioletVirtualizedRowLike>(options: {
    rows: RowLike[];
    estimatedRowHeight: number;
    overscanCount: number;
    virtualize: boolean;
}): {
    count: number;
    estimateSize: () => number;
    overscan: number;
    enabled: boolean;
    getItemKey: (index: number) => string | number;
};