const nativeInteractiveSelector = [
    "a[href]",
    "area[href]",
    "button",
    'input:not([type="hidden"])',
    "select",
    "textarea",
    "label",
    "summary",
    "audio[controls]",
    "video[controls]",
    '[contenteditable]:not([contenteditable="false"])',
].join(",");
function targetElement(target) {
    if (target instanceof Element) {
        return target;
    }
    return target instanceof Node ? target.parentElement : null;
}
export function isEditorElement(target) {
    return target instanceof HTMLElement && target.classList.contains("cell-editor");
}
export function isNativeInteractiveTarget(target) {
    const element = targetElement(target);
    return element !== null && element.closest(nativeInteractiveSelector) !== null;
}
export function isInteractiveCellWidgetTarget(target) {
    const element = targetElement(target);
    if (!element) {
        return false;
    }
    return (element.closest("[data-cell-widget]") !== null ||
        isNativeInteractiveTarget(element));
}
export function isCheckboxCellTarget(target) {
    return target instanceof HTMLElement && target.closest('[data-cell-widget="checkbox"]') !== null;
}
export function isFillHandleTarget(target) {
    return target instanceof HTMLElement && target.closest('[data-fill-handle="true"]') !== null;
}