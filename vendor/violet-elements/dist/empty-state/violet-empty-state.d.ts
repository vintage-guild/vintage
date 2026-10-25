import { FASTElement } from "@lushly-dev/fast-element";
import "../text/violet-text";
export type VioletEmptyStateAppearance = "plain" | "subtle" | "outline";
export type VioletEmptyStateOrientation = "vertical" | "horizontal";
/**
 * Composable empty-state surface for no-results, no-content, and first-run views.
 *
 * @summary Lightweight message surface with optional media and actions, built to compose with Violet text, image, and button primitives.
 * @slot - Optional extra descriptive content under the main message.
 * @slot media - Optional media or illustration shown before the copy.
 * @slot actions - Optional actions shown below the copy.
 * @csspart root - Outer empty-state surface.
 * @csspart media - Media wrapper.
 * @csspart body - Main copy wrapper.
 * @csspart heading - Rendered heading text.
 * @csspart message - Rendered message text.
 * @csspart actions - Actions row wrapper.
 */
export declare class VioletEmptyState extends FASTElement {
    #private;
    hasMedia: boolean;
    hasActions: boolean;
    heading: string;
    message: string;
    appearance: VioletEmptyStateAppearance;
    orientation: VioletEmptyStateOrientation;
    constructor();
    handleMediaSlotChange(): void;
    handleActionsSlotChange(): void;
    handleDefaultSlotChange(): void;
}