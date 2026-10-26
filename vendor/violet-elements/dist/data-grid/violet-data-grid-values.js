export function editStringForRawValue(rawValue) {
    if (rawValue === null || rawValue === undefined) {
        return "";
    }
    return String(rawValue);
}
export function booleanCellValue(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) && value !== 0;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on");
    }
    // Checkbox cells are binary. Null, mixed, objects, and unrecognized
    // strings render false and toggle to true rather than becoming an
    // accidental truthy state.
    return false;
}
export function normalizedEditingValue(cell, value) {
    if (cell.parse) {
        return cell.parse(value, cell.rowData);
    }
    if (cell.editor === "checkbox") {
        return booleanCellValue(value);
    }
    if (cell.editor === "number") {
        const textValue = String(value ?? "");
        if (textValue.trim() === "") {
            return null;
        }
        const numericValue = Number(textValue);
        return Number.isNaN(numericValue) ? textValue : numericValue;
    }
    return value;
}
export function resolveEditingValue(cell, value) {
    if (cell.editor === "number" && !cell.parse) {
        const textValue = String(value ?? "");
        if (textValue.trim() !== "" && !Number.isFinite(Number(textValue))) {
            return { valid: false, message: "Enter a valid number." };
        }
    }
    try {
        return { valid: true, value: normalizedEditingValue(cell, value) };
    }
    catch (error) {
        return {
            valid: false,
            message: error instanceof Error && error.message.trim() ? error.message : "Enter a valid value.",
        };
    }
}
export function opensOnSingleActiveClick(editor) {
    return editor === "select" || editor === "custom";
}