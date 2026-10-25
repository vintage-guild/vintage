export declare function eventPathElements(event: Event): HTMLElement[];
export declare function closestFromEventPath<T extends HTMLElement>(event: Event, selector: string): T | null;
export declare function cellElementFromTarget(target: EventTarget | null): HTMLTableCellElement | null;
export declare function cellElementFromEvent(event: Event): HTMLTableCellElement | null;