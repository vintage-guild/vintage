export function normalizePersonaPickerValues(values) {
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
export function parsePersonaPickerValue(value) {
    if (Array.isArray(value)) {
        return normalizePersonaPickerValues(value);
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
            return normalizePersonaPickerValues(parsed);
        }
    }
    catch {
        // Fall through to a delimiter parse for integration surfaces that still
        // pass plain strings instead of a serialized array.
    }
    return normalizePersonaPickerValues(trimmedValue.split(/\s*,\s*/u));
}
export function serializePersonaPickerValue(values) {
    return JSON.stringify(normalizePersonaPickerValues(values));
}