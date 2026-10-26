import { FASTElement } from "@lushly-dev/fast-element";
export type VioletColorSwatchShape = "square" | "circle";
export type VioletColorSwatchSize = "compact" | "natural" | "comfortable";
/**
 * Small reusable color preview swatch.
 *
 * @summary Token-driven color sample used by the Violet color picker and color-adjacent surfaces.
 * @csspart swatch - The rendered swatch surface.
 */
export declare class VioletColorSwatch extends FASTElement {
    value: string;
    label: string;
    decorative: boolean;
    shape: VioletColorSwatchShape;
    size: VioletColorSwatchSize;
    constructor();
    get normalizedValue(): string;
    get ariaLabel(): string;
}