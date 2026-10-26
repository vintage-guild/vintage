import { firstCellLocation as resolveFirstCellLocation } from "./violet-data-grid-navigation";
export function isValidCellLocation(rows, columns, location) {
    if (!location) {
        return false;
    }
    return (rows.some((row) => row.id === location.rowId) &&
        columns.some((column) => column.id === location.columnId));
}
export function syncActiveCell(options) {
    const { focusMode, rows, columns, activeCell } = options;
    if (focusMode !== "cell") {
        return null;
    }
    if (!rows.length || !columns.length) {
        return null;
    }
    if (!activeCell) {
        return null;
    }
    const rowExists = rows.some((row) => row.id === activeCell.rowId);
    const columnExists = columns.some((column) => column.id === activeCell.columnId);
    if (!rowExists || !columnExists) {
        return resolveFirstCellLocation(rows, columns);
    }
    return activeCell;
}
export function syncCellSelection(options) {
    const { focusMode, activeCell, cellSelection, isValidLocation } = options;
    if (focusMode !== "cell") {
        return null;
    }
    if (!activeCell || !cellSelection) {
        return cellSelection;
    }
    if (!isValidLocation(cellSelection.anchor) || !isValidLocation(cellSelection.focus)) {
        return null;
    }
    return cellSelection;
}
export function syncFillPreview(options) {
    const { focusMode, fillPreview, isValidLocation } = options;
    if (focusMode !== "cell" ||
        !fillPreview ||
        !isValidLocation(fillPreview.anchor) ||
        !isValidLocation(fillPreview.focus)) {
        return null;
    }
    return fillPreview;
}
export function syncEditingState(options) {
    const { focusMode, editingCell, editingValue, isEditableLocation } = options;
    if (focusMode !== "cell") {
        return {
            editingCell: null,
            editingValue: "",
        };
    }
    if (!editingCell) {
        return {
            editingCell,
            editingValue,
        };
    }
    if (!isEditableLocation(editingCell)) {
        return {
            editingCell: null,
            editingValue: "",
        };
    }
    return {
        editingCell,
        editingValue,
    };
}
export function withInteractionState(row, options) {
    return {
        ...row,
        cells: row.cells.map((cell) => {
            const editing = options.isEditingCell(cell.rowId, cell.columnId);
            return {
                ...cell,
                active: options.isActiveCell(cell.rowId, cell.columnId),
                selected: options.isCellSelected(cell.rowId, cell.columnId),
                fillPreview: options.isFillPreviewCell(cell.rowId, cell.columnId),
                rangeEdge: options.rangeEdgeForCell(cell.rowId, cell.columnId),
                editing,
                editValue: editing ? options.editingValue : "",
                editingError: editing ? options.editingError : "",
                resolvedCellPartText: options.resolveCellPartText(cell.rowId, cell.columnId, cell.cellPartText),
            };
        }),
    };
}
export function createPresentedColumn(column, options) {
    const resolvedWidth = options.resolvedWidth ?? "var(--violet-data-grid-default-column-width, 12rem)";
    return {
        id: column.id,
        label: column.label,
        sortable: column.sortable ?? false,
        width: resolvedWidth,
        widthStyle: `width:${resolvedWidth};inline-size:${resolvedWidth};min-inline-size:${resolvedWidth};max-inline-size:${resolvedWidth};`,
        align: column.align ?? "start",
        headerPart: column.headerPart,
        headerPartText: options.mergePartNames("header-cell", column.headerPart),
        cellPart: column.cellPart,
        cellPartText: options.mergePartNames("cell", column.cellPart),
        source: column,
    };
}
export function createPresentedRow(row, columns, options) {
    const rowLabel = row.label?.trim() || row.id;
    return {
        id: row.id,
        label: rowLabel,
        data: row.data,
        cells: columns.map((column) => {
            const rawValue = options.cellValueFor(row, column);
            return {
                rowId: row.id,
                rowLabel,
                columnId: column.id,
                columnLabel: column.label,
                rowData: row.data,
                align: column.align,
                rawValue,
                text: options.serializeCellValue(column.source, row.data, rawValue),
                widthStyle: column.widthStyle,
                cellId: options.cellIdFor(row.id, column.id),
                active: false,
                selected: false,
                rangeEdge: "",
                editable: column.source.editable ?? false,
                editor: column.source.editor ?? "text",
                editing: false,
                editValue: "",
                editingError: "",
                editingErrorId: options.editingErrorIdFor(row.id, column.id),
                fillPreview: false,
                cellPart: column.cellPart,
                cellPartText: column.cellPartText,
                resolvedCellPartText: column.cellPartText,
                cellTemplate: column.source.cellTemplate,
                editorTemplate: column.source.editorTemplate,
                editorOptions: options.editorOptionsForColumn(column.source, row.data),
                parse: column.source.parse,
            };
        }),
    };
}