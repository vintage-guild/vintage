export function cellValueFor(row, column) {
    return (column.render?.(row.data) ??
        column.value?.(row.data) ??
        (column.id in Object(row.data) ? row.data[column.id] : undefined));
}
export function editorOptionsForColumn(column, rowData) {
    if (!column.editorOptions) {
        return [];
    }
    return typeof column.editorOptions === "function"
        ? column.editorOptions(rowData)
        : column.editorOptions;
}
export function stringifyUnknown(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof Node !== "undefined" && value instanceof Node) {
        return value.textContent ?? "";
    }
    if (Array.isArray(value)) {
        return value.map(item => stringifyUnknown(item)).join(", ");
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
export function stringifyCellValue(rawValue) {
    if (rawValue === null || rawValue === undefined) {
        return "";
    }
    if (typeof rawValue === "string" ||
        typeof rawValue === "number" ||
        typeof rawValue === "boolean" ||
        typeof rawValue === "bigint") {
        return String(rawValue);
    }
    if (rawValue instanceof Date) {
        return rawValue.toISOString();
    }
    if (Array.isArray(rawValue)) {
        return rawValue.map(value => stringifyUnknown(value)).join(", ");
    }
    return stringifyUnknown(rawValue);
}
export function serializeCellValue(options) {
    if (options.column.serialize) {
        return options.column.serialize(options.rawValue, options.rowData);
    }
    if (options.column.editor === "checkbox") {
        return options.booleanCellValue(options.rawValue) ? "true" : "false";
    }
    return stringifyCellValue(options.rawValue);
}
export function sortRows(options) {
    const sourceRows = options.rows ?? [];
    if (!options.sort || options.sortMode === "external") {
        return [...sourceRows];
    }
    const sortableColumn = options.columns.find(column => column.id === options.sort?.columnId);
    if (!sortableColumn || !sortableColumn.sortable) {
        return [...sourceRows];
    }
    const direction = options.sort.direction === "ascending" ? 1 : -1;
    const getSortKey = options.getSortKey ?? ((row, column) => stringifyCellValue(cellValueFor(row, column)));
    const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
    });
    const keyedRows = sourceRows.map(row => ({
        row,
        key: getSortKey(row, sortableColumn),
    }));
    keyedRows.sort((left, right) => collator.compare(left.key, right.key) * direction);
    return keyedRows.map(entry => entry.row);
}