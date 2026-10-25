import { FASTElement } from "@lushly-dev/fast-element";
export type VioletTextAs = "span" | "p" | "small" | "strong" | "label" | "h1" | "h2" | "h3" | "h4";
export type VioletTextVariant = "body" | "label" | "caption" | "title-sm" | "title-md";
export type VioletTextTone = "default" | "secondary" | "muted" | "success" | "warning" | "danger";
/**
 * Semantic Violet typography primitive.
 *
 * @summary Text wrapper that applies Violet type ramps and tones while preserving the underlying HTML semantics.
 * @slot - Text content.
 * @csspart root - The rendered semantic text element.
 */
export declare class VioletText extends FASTElement {
    as: VioletTextAs;
    variant: VioletTextVariant;
    tone: VioletTextTone;
    truncate: boolean;
    constructor();
}