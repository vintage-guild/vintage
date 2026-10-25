import { FASTElement } from "@lushly-dev/fast-element";
import "../button/violet-button";
import "../card/violet-card";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
/**
 * Floating transient notification surface.
 *
 * @summary Token-driven toast surface with optional title, actions, auto-dismiss timeout, and explicit announcement behavior.
 * @fires dismiss - Emitted when the toast closes because of timeout or the dismiss button. Detail: `{ reason: "timeout" | "dismiss-button" }`.
 * @fires open-change - Emitted when the open state changes. Detail: `{ open: boolean }`.
 * @slot icon - Optional leading icon that overrides the default tone icon.
 * @slot title - Optional toast heading.
 * @slot - Toast body content.
 * @slot actions - Optional action controls. Presence of actions disables auto-dismiss.
 * @csspart root - The outer card surface.
 * @csspart layout - Internal layout wrapper.
 * @csspart icon - Leading icon container.
 * @csspart body - Text and actions wrapper.
 * @csspart title - Heading text wrapper.
 * @csspart content - Body content wrapper.
 * @csspart actions - Action row wrapper.
 * @csspart dismiss-button - Optional dismiss button.
 */
export declare class VioletToast extends FASTElement {
    #private;
    hasTitle: boolean;
    hasActions: boolean;
    hasIcon: boolean;
    open: boolean;
    tone: string;
    announcement: string;
    dismissible: boolean;
    timeout: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    openChanged(previous: boolean | undefined, next: boolean): void;
    timeoutChanged(): void;
    handleTitleSlotChange(): void;
    handleActionsSlotChange(): void;
    handleIconSlotChange(): void;
    dismiss(reason: "timeout" | "dismiss-button"): void;
    get showLeading(): boolean;
    get liveRegionRole(): "alert" | "status" | null;
    get liveRegionPoliteness(): "assertive" | "polite" | null;
    get defaultIconTemplate(): import("@lushly-dev/fast-element").ViewTemplate<any, any>;
}
export type VioletToastTone = "default" | "info" | "success" | "warning" | "danger";
export type VioletToastAnnouncement = "off" | "polite" | "assertive";