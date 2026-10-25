import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Generic anchored floating surface.
 *
 * @summary Token-driven popover surface built on the native HTML Popover API.
 * @fires open-change - Emitted when the popover opens or closes. Detail: `{ open: boolean }`.
 * @slot trigger - Optional trigger element that toggles the popover.
 * @slot - Popover body content.
 * @csspart anchor - The wrapper around the trigger slot used as the anchor.
 * @csspart surface - The floating surface container.
 */
export declare class VioletPopover extends FASTElement {
    #private;
    open: boolean;
    positioning: string;
    anchor: string;
    readonly surfaceId: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    openChanged(): void;
    anchorChanged(): void;
    show(): void;
    hide(): void;
    toggle(): void;
    handleTriggerClick(): void;
    handleToggle(event: ToggleEvent): void;
    private get surfaceElement();
    private resolveExternalAnchor;
    private detachExternalAnchor;
    private readonly handleTriggerClickBound;
}