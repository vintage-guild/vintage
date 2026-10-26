import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../card/violet-card";
/**
 * Violet tool result card.
 *
 * @summary Renders tool execution output with collapsible detail view.
 *          Maps to TanStack AI ToolResultPart.
 * @slot summary - Compact result summary line.
 * @slot - Result body content.
 * @slot footer - Optional metadata.
 * @csspart root - The outer container.
 * @csspart summary - The clickable summary row.
 * @csspart status-icon - The success/error icon.
 * @csspart body - The collapsible body.
 * @csspart footer - The metadata footer.
 */
export declare class VioletToolResultCard extends FASTElement {
    state: string;
    expanded: boolean;
    hasFooter: boolean;
    constructor();
    connectedCallback(): void;
    toggleExpanded(): void;
    handleFooterSlotChange(): void;
}
export type VioletToolResultState = "pending" | "executing" | "output-available" | "output-error";