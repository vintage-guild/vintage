import { FASTElement } from "@lushly-dev/fast-element";
type VioletTabInternalAppearance = "open" | "closed" | "mixed";
type VioletTabInternalOrientation = "horizontal" | "vertical";
/**
 * Violet reusable tab primitive.
 *
 * @summary Token-driven tab item managed by violet-tabs for selection, keyboarding, and panel linkage.
 * @slot - Tab label content.
 * @csspart root - Visible tab surface.
 * @csspart label - Tab label wrapper.
 * @csspart indicator - Underline indicator used by open tab presentation.
 */
export declare class VioletTab extends FASTElement {
    #private;
    /**
     * Disables the individual tab.
     */
    disabled: boolean;
    get effectiveDisabled(): boolean;
    setDisabledFromTabs(disabled: boolean): void;
    syncPresentation(appearance: VioletTabInternalAppearance, orientation: VioletTabInternalOrientation): void;
}
export {};