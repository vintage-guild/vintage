import { FASTElement } from "@lushly-dev/fast-element";
export type VioletSpinnerSize = "sm" | "md" | "lg";
/**
 * Compact indeterminate loading indicator.
 *
 * @summary Token-driven spinner for local loading and waiting states.
 * @csspart spinner - The animated circular indicator.
 */
export declare class VioletSpinner extends FASTElement {
    label: string;
    decorative: boolean;
    size: "sm" | "md" | "lg";
    constructor();
    get accessibleLabel(): string;
}