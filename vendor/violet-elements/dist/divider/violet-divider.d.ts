import { FASTElement } from "@lushly-dev/fast-element";
export type VioletDividerAppearance = "subtle" | "strong";
export type VioletDividerOrientation = "horizontal" | "vertical";
/**
 * Structural Violet divider for subtle or strong boundaries between regions.
 *
 * @summary Token-driven horizontal or vertical separator with optional decorative mode.
 * @csspart rule - The rendered divider rule.
 */
export declare class VioletDivider extends FASTElement {
    appearance: VioletDividerAppearance;
    orientation: VioletDividerOrientation;
    decorative: boolean;
    constructor();
}