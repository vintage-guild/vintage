import { FASTElement } from "@lushly-dev/fast-element";
import type { VioletTab } from "../tab/violet-tab";
import type { VioletTabPanel } from "../tab-panel/violet-tab-panel";
export type VioletTabsAppearance = "open" | "closed" | "mixed";
export type VioletTabsOrientation = "horizontal" | "vertical";
/**
 * Violet reusable tabs composite.
 *
 * @summary Token-driven tabs with automatic activation, panel linkage, and open or closed visual treatments.
 * @slot tab - Tab items.
 * @slot tabpanel - Panels paired to tabs in source order.
 * @fires change - Emitted when the active tab changes.
 * @csspart tablist-shell - Wrapper around the tablist and divider.
 * @csspart tablist - Element carrying the tablist role.
 * @csspart panel-region - Wrapper around the active tab panels.
 */
export declare class VioletTabs extends FASTElement {
    #private;
    tabs: VioletTab[];
    panels: VioletTabPanel[];
    hasPanels: boolean;
    /**
     * Visual treatment for the tab rail.
     */
    appearance: VioletTabsAppearance;
    /**
     * Disables tab interaction.
     */
    disabled: boolean;
    /**
     * Orientation for the tablist keyboard and layout framing.
     */
    orientation: VioletTabsOrientation;
    /**
     * Active tab id.
     */
    activeid: string;
    activetab: VioletTab | null;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    appearanceChanged(): void;
    disabledChanged(): void;
    orientationChanged(): void;
    activeidChanged(previous: string, next: string): void;
    handleTabSlotChange(): void;
    handlePanelSlotChange(): void;
}