import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
export type VioletBadgeAppearance = "filled" | "outline" | "subtle";
export type VioletBadgeColor = "neutral" | "accent" | "success" | "warning" | "danger";
export type VioletBadgeSize = "sm" | "md" | "lg";
/**
 * Compact semantic badge for status, category, and count-like labeling.
 *
 * @summary Token-driven inline badge with semantic color and emphasis variants.
 * @slot - Badge text or short inline content.
 * @csspart badge - The outer pill surface.
 * @csspart icon - Optional leading icon.
 * @csspart content - Wrapper around slotted badge content.
 */
export declare class VioletBadge extends FASTElement {
    appearance: VioletBadgeAppearance;
    color: VioletBadgeColor;
    size: VioletBadgeSize;
    decorative: boolean;
    icon: string;
    label: string;
    constructor();
    connectedCallback(): void;
    decorativeChanged(): void;
    labelChanged(): void;
    private syncAccessibilityState;
}