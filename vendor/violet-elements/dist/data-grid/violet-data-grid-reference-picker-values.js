export function normalizeReferencePickerValues(values) {
    const seen = new Set();
    const normalized = [];
    for (const value of values) {
        const nextValue = String(value ?? "").trim();
        if (!nextValue || seen.has(nextValue)) {
            continue;
        }
        seen.add(nextValue);
        normalized.push(nextValue);
    }
    return normalized;
}
export function parseReferencePickerValue(value) {
    if (Array.isArray(value)) {
        return normalizeReferencePickerValues(value);
    }
    if (typeof value !== "string") {
        return [];
    }
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return [];
    }
    try {
        const parsed = JSON.parse(trimmedValue);
        if (Array.isArray(parsed)) {
            return normalizeReferencePickerValues(parsed);
        }
    }
    catch {
        // Fall through to a delimiter parse for integration surfaces that still
        // pass plain strings instead of a serialized array.
    }
    return normalizeReferencePickerValues(trimmedValue.split(/\s*,\s*/u));
}
export function serializeReferencePickerValue(values) {
    return JSON.stringify(normalizeReferencePickerValues(values));
}