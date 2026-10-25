import { FASTElement } from "@lushly-dev/fast-element";
export type VioletImageFit = "cover" | "contain" | "fill";
export type VioletImageRatio = "auto" | "square" | "landscape" | "portrait" | "video";
export type VioletImageShape = "square" | "rounded" | "circle";
export type VioletImageLoading = "eager" | "lazy";
/**
 * Native-first Violet image primitive with aspect ratio, fit, and fallback support.
 *
 * @summary Media wrapper around a real image element with decorative handling and a slotted fallback surface.
 * @slot fallback - Optional fallback content shown when there is no image source or the image fails to load.
 * @csspart root - The media frame wrapper.
 * @csspart image - The rendered image element.
 * @csspart fallback - The fallback container.
 */
export declare class VioletImage extends FASTElement {
    imageFailed: boolean;
    src: string;
    alt: string;
    fit: VioletImageFit;
    ratio: VioletImageRatio;
    shape: VioletImageShape;
    loading: VioletImageLoading;
    decorative: boolean;
    constructor();
    connectedCallback(): void;
    srcChanged(): void;
    get showImage(): boolean;
    get computedAlt(): string;
    get accessibleRole(): string | null;
    get accessibleLabel(): string | null;
    handleImageError(): void;
    private syncVisualState;
}