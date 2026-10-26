export function sampleAutosizeRows(rows) {
    if (rows.length <= 150) {
        return rows;
    }
    const sample = rows.slice(0, 100);
    const remaining = rows.length - 100;
    const stride = Math.max(1, Math.floor(remaining / 50));
    for (let index = 100; index < rows.length && sample.length < 150; index += stride) {
        const row = rows[index];
        if (row) {
            sample.push(row);
        }
    }
    const lastRow = rows[rows.length - 1];
    if (lastRow && !sample.includes(lastRow)) {
        sample.push(lastRow);
    }
    return sample;
}
export function copyTextForSelection(options) {
    const { selection, locations, rows, columns, getCellText, } = options;
    if (!locations.length) {
        return "";
    }
    if (!selection) {
        return getCellText(locations[0]);
    }
    const lines = [];
    for (let rowIndex = selection.rowStart; rowIndex <= selection.rowEnd; rowIndex += 1) {
        const cells = [];
        for (let columnIndex = selection.columnStart; columnIndex <= selection.columnEnd; columnIndex += 1) {
            const row = rows[rowIndex];
            const column = columns[columnIndex];
            if (!row || !column) {
                continue;
            }
            cells.push(getCellText({
                rowId: row.id,
                columnId: column.id,
            }));
        }
        lines.push(cells.join("\t"));
    }
    return lines.join("\n");
}
export function normalizePastedText(text) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
}
export function resolvePasteOriginLocation(options) {
    const { selection, rows, columns, activeCell, } = options;
    if (!selection) {
        return activeCell;
    }
    const row = rows[selection.rowStart];
    const column = columns[selection.columnStart];
    if (!row || !column) {
        return activeCell;
    }
    return {
        rowId: row.id,
        columnId: column.id,
    };
}