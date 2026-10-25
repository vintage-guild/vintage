export function eventPathElements(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const elements = [];
    const seen = new Set();
    const pushUnique = (element) => {
        if (seen.has(element)) {
            return;
        }
        seen.add(element);
        elements.push(element);
    };
    for (const entry of path) {
        if (entry instanceof HTMLElement) {
            pushUnique(entry);
            continue;
        }
        if (entry instanceof Node && entry.parentElement instanceof HTMLElement) {
            pushUnique(entry.parentElement);
        }
    }
    return elements;
}
export function closestFromEventPath(event, selector) {
    for (const element of eventPathElements(event)) {
        const match = element.closest(selector);
        if (match instanceof HTMLElement) {
            return match;
        }
    }
    return null;
}
export function cellElementFromTarget(target) {
    const element = target instanceof HTMLElement
        ? target
        : target instanceof Node
            ? target.parentElement
            : null;
    if (!element) {
        return null;
    }
    return element.closest("td[data-row-id][data-column-id]");
}
export function cellElementFromEvent(event) {
    return closestFromEventPath(event, "td[data-row-id][data-column-id]");
}