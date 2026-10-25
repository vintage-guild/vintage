const iconRegistry = new Map();
export function registerVioletIcon(definition) {
    iconRegistry.set(definition.name, definition);
    return definition;
}
export function registerVioletIcons(definitions) {
    definitions.forEach(registerVioletIcon);
    return definitions;
}
export function resolveVioletIcon(name) {
    return iconRegistry.get(name) ?? null;
}
export function hasVioletIcon(name) {
    return iconRegistry.has(name);
}
export function listRegisteredVioletIcons() {
    return [...iconRegistry.keys()].sort((a, b) => a.localeCompare(b));
}
export function clearVioletIconRegistryForTesting() {
    iconRegistry.clear();
}