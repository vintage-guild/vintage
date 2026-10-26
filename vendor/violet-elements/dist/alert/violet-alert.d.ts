import { FASTElement } from "@lushly-dev/fast-element";
import "../button/violet-button";
import "../card/violet-card";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
/**
 * Persistent inline or banner-style message surface.
 *
 * @summary Token-driven alert composed with Violet card, icon, and button primitives.
 * @fires dismiss - Emitted when the dismiss control is activated.
 * @slot icon - Optional leading icon that overrides the default tone icon.
 * @slot title - Optional alert heading.
 * @slot - Alert body content.
 * @slot actions - Optional action buttons or links.
 * @csspart root - The outer card surface.
 * @csspart layout - Internal layout wrapper.
 * @csspart icon - Leading icon container.
 * @csspart body - Text and actions wrapper.
 * @csspart title - Heading text wrapper.
 * @csspart content - Body content wrapper.
 * @csspart actions - Action row wrapper.
 * @csspart dismiss-button - Optional dismiss button.
 */
export declare class VioletAlert extends FASTElement {
    #private;
    hasTitle: boolean;
    hasActions: boolean;
    hasIcon: boolean;
    tone: string;
    announcement: string;
    dismissible: boolean;
    constructor();
    connectedCallback(): void;
    get showLeading(): boolean;
    get liveRegionRole(): "alert" | "status" | null;
    get liveRegionPoliteness(): "assertive" | "polite" | null;
    get defaultIconTemplate(): import("@lushly-dev/fast-element").ViewTemplate<any, any>;
    handleTitleSlotChange(): void;
    handleActionsSlotChange(): void;
    handleIconSlotChange(): void;
    handleDismiss(): void;
}
export type VioletAlertTone = "default" | "info" | "success" | "warning" | "danger";
export type VioletAlertAnnouncement = "off" | "polite" | "assertive";