import type { VioletOption } from "../option/violet-option";
export declare function normalizeMatchText(value: string): string;
export declare function isOptionDisabled(option: VioletOption): boolean;
export declare function getOwnedOptions(host: Element): VioletOption[];
export declare function getEnabledOptions(options: VioletOption[]): VioletOption[];
export declare function getSelectedOption(options: VioletOption[], value: string): VioletOption | null;
export declare function getNextEnabledIndex(options: VioletOption[], currentIndex: number, step: 1 | -1): number;
export declare function findTypeaheadMatch(options: VioletOption[], buffer: string, activeValue: string): VioletOption | null;
export declare function syncOptionSelection(options: VioletOption[], selectedValues: string[] | string, activeValue: string): void;