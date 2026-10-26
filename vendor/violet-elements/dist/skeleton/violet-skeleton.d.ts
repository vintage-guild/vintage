import { FASTElement } from "@lushly-dev/fast-element";
export type VioletSkeletonShape = "rect" | "circle" | "text";
export type VioletSkeletonSize = "sm" | "md" | "lg";
/**
 * Decorative loading placeholder primitive for content that has not resolved yet.
 *
 * @summary Quiet Violet skeleton with rectangle, circle, and multi-line text presets.
 * @csspart root - Wrapper around the placeholder bars.
 * @csspart bar - Individual placeholder bar.
 */
export declare class VioletSkeleton extends FASTElement {
    shape: VioletSkeletonShape;
    size: VioletSkeletonSize;
    lines: string;
    animated: boolean;
    constructor();
    connectedCallback(): void;
}