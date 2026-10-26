export function normalizeMatchText(value) {
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
export function isOptionDisabled(option) {
    const group = option.closest("violet-option-group");
    return Boolean(option.disabled || group?.disabled);
}
export function getOwnedOptions(host) {
    const selector = host.localName;
    return Array.from(host.querySelectorAll("violet-option")).filter((option) => option.closest(selector) === host);
}
export function getEnabledOptions(options) {
    return options.filter(option => !isOptionDisabled(option));
}
export function getSelectedOption(options, value) {
    if (!value) {
        return options.find(option => option.selected && !isOptionDisabled(option)) ?? null;
    }
    return options.find(option => option.value === value && !isOptionDisabled(option)) ?? null;
}
export function getNextEnabledIndex(options, currentIndex, step) {
    if (options.length === 0) {
        return -1;
    }
    let index = currentIndex;
    for (let count = 0; count < options.length; count += 1) {
        index = (index + step + options.length) % options.length;
        if (options[index] && !isOptionDisabled(options[index])) {
            return index;
        }
    }
    return -1;
}
export function findTypeaheadMatch(options, buffer, activeValue) {
    const enabled = getEnabledOptions(options);
    if (enabled.length === 0 || !buffer) {
        return null;
    }
    const normalized = normalizeMatchText(buffer.trim());
    const currentIndex = enabled.findIndex(option => option.value === activeValue);
    const ordered = currentIndex >= 0 ? [...enabled.slice(currentIndex + 1), ...enabled.slice(0, currentIndex + 1)] : enabled;
    return ordered.find(option => normalizeMatchText(option.labelText).startsWith(normalized)) ?? null;
}
export function syncOptionSelection(options, selectedValues, activeValue) {
    const selection = new Set(Array.isArray(selectedValues) ? selectedValues : selectedValues ? [selectedValues] : []);
    for (const option of options) {
        option.groupDisabled = Boolean(option.closest("violet-option-group")?.disabled);
        option.selected = selection.has(option.value);
        option.active = activeValue !== "" && option.value === activeValue;
    }
}