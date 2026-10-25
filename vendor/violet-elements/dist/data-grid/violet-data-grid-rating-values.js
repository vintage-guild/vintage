const DEFAULT_RATING_MAX = 5;
export function normalizeRatingMax(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return DEFAULT_RATING_MAX;
    }
    return Math.min(10, Math.max(1, Math.round(numericValue)));
}
export function parseRatingValue(value, max = DEFAULT_RATING_MAX) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "string" && value.trim() === "") {
        return null;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return null;
    }
    const normalizedValue = Math.round(numericValue);
    if (normalizedValue <= 0) {
        return null;
    }
    return Math.min(normalizeRatingMax(max), normalizedValue);
}
export function serializeRatingValue(value, max = DEFAULT_RATING_MAX) {
    const rating = parseRatingValue(value, max);
    return rating === null ? "" : String(rating);
}