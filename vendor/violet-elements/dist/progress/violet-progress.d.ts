import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Native-first linear progress indicator.
 *
 * @summary Styled wrapper around the native HTML progress element for determinate and indeterminate loading.
 * @csspart header - Optional label and value row.
 * @csspart label - Optional visible progress label.
 * @csspart value-label - Optional visible percentage label.
 * @csspart progress - The styled native progress element.
 */
export declare class VioletProgress extends FASTElement {
    label: string;
    value: string;
    max: string;
    valueText: string;
    constructor();
    get normalizedMax(): string;
    get progressValueAttribute(): string | null;
    get accessibleLabel(): string;
    get showValueLabel(): boolean;
    get valueLabel(): string;
}