import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../button/violet-button";
import "../card/violet-card";
/**
 * Violet approval card.
 *
 * @summary Human-in-the-loop approval surface for sensitive tool actions.
 *          Maps to TanStack AI approval-requested / AI SDK approval flow.
 * @slot summary - What action needs approval.
 * @slot detail - Expanded explanation or consequences.
 * @slot actions - Custom action buttons (approve/deny provided by default).
 * @csspart root - The outer container.
 * @csspart header - The status header bar.
 * @csspart summary - The action summary.
 * @csspart detail - The detail section.
 * @csspart actions - The action button row.
 * @csspart approve-button - The default approve button.
 * @csspart deny-button - The default deny button.
 * @fires approve - When the user approves the action.
 * @fires deny - When the user denies the action.
 */
export declare class VioletApprovalCard extends FASTElement {
    state: string;
    hasSummary: boolean;
    hasDetail: boolean;
    constructor();
    connectedCallback(): void;
    handleApprove(): void;
    handleDeny(): void;
    handleSummarySlotChange(): void;
    handleDetailSlotChange(): void;
}
export type VioletApprovalState = "pending" | "approved" | "denied";