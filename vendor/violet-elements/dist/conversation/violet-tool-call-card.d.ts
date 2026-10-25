import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../card/violet-card";
import "./violet-approval-card";
/**
 * Violet tool call card.
 *
 * @summary Renders a tool invocation through its TanStack AI lifecycle states.
 *          Maps to TanStack AI ToolCallPart / AI SDK ToolUIPart.
 * @slot icon - Custom icon for the tool (defaults to system/settings icon).
 * @slot summary - Concise description of the tool's purpose.
 * @slot input - Tool arguments display.
 * @slot output - Tool result display.
 * @slot - Additional content.
 * @csspart root - The outer container.
 * @csspart header - The header bar with name and badge.
 * @csspart icon - The tool icon.
 * @csspart name - The tool name.
 * @csspart badge - The state badge.
 * @csspart body - The body content area.
 * @fires approve - Emitted when the delegated approval card is approved. Detail: { toolCallId }.
 * @fires deny - Emitted when the delegated approval card is denied. Detail: { toolCallId }.
 */
export declare class VioletToolCallCard extends FASTElement {
    toolName: string;
    toolCallId: string;
    state: string;
    hasBody: boolean;
    hasDetailContent: boolean;
    constructor();
    connectedCallback(): void;
    updateHasBody(): void;
    badgeText(): string;
    handleApprove(): void;
    handleDeny(): void;
}
export type VioletToolCallState = "pending" | "approval-requested" | "executing" | "output-available" | "output-error" | "cancelled";