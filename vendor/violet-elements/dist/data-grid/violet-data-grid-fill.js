function cellAtLocation(rows, columns, location) {
    const row = rows.find(candidate => candidate.id === location.rowId);
    const columnIndex = columns.findIndex(column => column.id === location.columnId);
    if (!row || columnIndex < 0) {
        return null;
    }
    return row.cells[columnIndex] ?? null;
}
export function hasEditableCellsInBounds(rows, bounds) {
    if (!bounds) {
        return false;
    }
    for (let rowIndex = bounds.rowStart; rowIndex <= bounds.rowEnd; rowIndex += 1) {
        const row = rows[rowIndex];
        if (!row) {
            continue;
        }
        for (let columnIndex = bounds.columnStart; columnIndex <= bounds.columnEnd; columnIndex += 1) {
            if (row.cells[columnIndex]?.editable) {
                return true;
            }
        }
    }
    return false;
}
export function isEditableStrip(rows, rowStart, rowEnd, columnStart, columnEnd) {
    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
        const row = rows[rowIndex];
        if (!row) {
            return false;
        }
        for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
            if (!row.cells[columnIndex]?.editable) {
                return false;
            }
        }
    }
    return true;
}
export function clampFillBoundsToEditableTargets(rows, expandedBounds, sourceBounds) {
    const clamped = { ...sourceBounds };
    for (let rowIndex = sourceBounds.rowStart - 1; rowIndex >= expandedBounds.rowStart; rowIndex -= 1) {
        if (!isEditableStrip(rows, rowIndex, rowIndex, clamped.columnStart, clamped.columnEnd)) {
            break;
        }
        clamped.rowStart = rowIndex;
    }
    for (let rowIndex = sourceBounds.rowEnd + 1; rowIndex <= expandedBounds.rowEnd; rowIndex += 1) {
        if (!isEditableStrip(rows, rowIndex, rowIndex, clamped.columnStart, clamped.columnEnd)) {
            break;
        }
        clamped.rowEnd = rowIndex;
    }
    for (let columnIndex = sourceBounds.columnStart - 1; columnIndex >= expandedBounds.columnStart; columnIndex -= 1) {
        if (!isEditableStrip(rows, clamped.rowStart, clamped.rowEnd, columnIndex, columnIndex)) {
            break;
        }
        clamped.columnStart = columnIndex;
    }
    for (let columnIndex = sourceBounds.columnEnd + 1; columnIndex <= expandedBounds.columnEnd; columnIndex += 1) {
        if (!isEditableStrip(rows, clamped.rowStart, clamped.rowEnd, columnIndex, columnIndex)) {
            break;
        }
        clamped.columnEnd = columnIndex;
    }
    return clamped;
}
export function buildPasteChanges(options) {
    const { text, originIndices, selection, selectedLocations, rows, columns, normalizeValue, } = options;
    const matrix = text.split("\n").map(line => line.split("\t"));
    const isSingleValuePaste = matrix.length === 1 && (matrix[0]?.length ?? 0) === 1;
    if (selection && isSingleValuePaste) {
        return selectedLocations.flatMap(location => {
            const cell = cellAtLocation(rows, columns, location);
            if (!cell?.editable) {
                return [];
            }
            return [
                {
                    rowId: location.rowId,
                    columnId: location.columnId,
                    value: normalizeValue(cell, matrix[0]?.[0] ?? ""),
                },
            ];
        });
    }
    const changes = [];
    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
        const values = matrix[rowOffset] ?? [];
        const row = rows[originIndices.rowIndex + rowOffset];
        if (!row) {
            break;
        }
        for (let columnOffset = 0; columnOffset < values.length; columnOffset += 1) {
            const column = columns[originIndices.columnIndex + columnOffset];
            const cell = row.cells[originIndices.columnIndex + columnOffset];
            if (!column || !cell) {
                break;
            }
            if (!cell.editable) {
                continue;
            }
            changes.push({
                rowId: row.id,
                columnId: column.id,
                value: normalizeValue(cell, values[columnOffset] ?? ""),
            });
        }
    }
    return changes;
}
export function buildFillChanges(options) {
    const { rows, columns, sourceBounds, targetBounds, normalizeValue, } = options;
    const sourceHeight = sourceBounds.rowEnd - sourceBounds.rowStart + 1;
    const sourceWidth = sourceBounds.columnEnd - sourceBounds.columnStart + 1;
    const changes = [];
    for (let rowIndex = targetBounds.rowStart; rowIndex <= targetBounds.rowEnd; rowIndex += 1) {
        for (let columnIndex = targetBounds.columnStart; columnIndex <= targetBounds.columnEnd; columnIndex += 1) {
            const inSource = rowIndex >= sourceBounds.rowStart &&
                rowIndex <= sourceBounds.rowEnd &&
                columnIndex >= sourceBounds.columnStart &&
                columnIndex <= sourceBounds.columnEnd;
            if (inSource) {
                continue;
            }
            const targetRow = rows[rowIndex];
            const targetColumn = columns[columnIndex];
            const targetCell = targetRow?.cells[columnIndex];
            if (!targetRow || !targetColumn || !targetCell?.editable) {
                continue;
            }
            const sourceRowIndex = sourceBounds.rowStart + ((rowIndex - sourceBounds.rowStart) % sourceHeight);
            const sourceColumnIndex = sourceBounds.columnStart + ((columnIndex - sourceBounds.columnStart) % sourceWidth);
            const sourceCell = rows[sourceRowIndex]?.cells[sourceColumnIndex];
            if (!sourceCell) {
                continue;
            }
            const rawValue = sourceCell.rawValue ?? sourceCell.text;
            changes.push({
                rowId: targetRow.id,
                columnId: targetColumn.id,
                value: targetCell.editor === "number"
                    ? normalizeValue(targetCell, String(rawValue ?? ""))
                    : rawValue,
            });
        }
    }
    return changes;
}