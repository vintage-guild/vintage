export function buildRenderedRows(options) {
    if (!options.virtualize) {
        return {
            renderedRows: options.rows.map((row, index) => ({
                item: {
                    key: row.id,
                    index,
                    start: index * options.estimatedRowHeight,
                    end: (index + 1) * options.estimatedRowHeight,
                    size: options.estimatedRowHeight,
                    lane: 0,
                },
                row,
            })),
            virtualPaddingStart: 0,
            virtualPaddingEnd: 0,
        };
    }
    const firstItem = options.virtualItems[0];
    const lastItem = options.virtualItems[options.virtualItems.length - 1];
    return {
        renderedRows: options.virtualItems
            .map(item => {
            const row = options.rows[item.index];
            return row ? { item, row } : null;
        })
            .filter((value) => value !== null),
        virtualPaddingStart: firstItem?.start ?? 0,
        virtualPaddingEnd: Math.max(0, options.totalSize - (lastItem?.end ?? 0)),
    };
}
export function buildVirtualizerUpdateOptions(options) {
    return {
        count: options.rows.length,
        estimateSize: () => options.estimatedRowHeight,
        overscan: options.overscanCount,
        enabled: options.virtualize && options.rows.length > 0,
        getItemKey: (index) => options.rows[index]?.id ?? index,
    };
}