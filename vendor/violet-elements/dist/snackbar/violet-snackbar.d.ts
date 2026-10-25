import { FASTElement } from "@lushly-dev/fast-element";
import "../button/violet-button";
import "../card/violet-card";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
/**
 * Compact transient message with optional single action.
 *
 * @summary Lightweight snackbar surface for short-lived feedback near the bottom of the viewport.
 * @fires dismiss - Emitted when the snackbar closes. Detail: `{ reason: "timeout" | "dismiss-button" }`.
 * @fires open-change - Emitted when the open state changes. Detail: `{ open: boolean }`.
 * @slot - Snackbar message content.
 * @slot action - Optional single action control. Presence disables auto-dismiss.
 * @csspart root - The outer card surface.
 * @csspart layout - Internal row layout.
 * @csspart message - Message wrapper.
 * @csspart action - Action slot wrapper.
 * @csspart dismiss-button - Optional dismiss button.
 */
export declare class VioletSnackbar extends FASTElement {
    #private;
    hasAction: boolean;
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
    handleActionSlotChange(): void;
    dismiss(reason: "timeout" | "dismiss-button"): void;
    get liveRegionRole(): "alert" | "status" | null;
    get liveRegionPoliteness(): "assertive" | "polite" | null;
}
export type VioletSnackbarTone = "default" | "info" | "success" | "warning" | "danger";
export type VioletSnackbarAnnouncement = "off" | "polite" | "assertive";