import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
/**
 * Violet reasoning block.
 *
 * @summary Collapsible thinking/reasoning region for displaying model
 *          chain-of-thought content. Maps to TanStack AI ThinkingPart /
 *          AI SDK ReasoningUIPart.
 * @slot - Reasoning text content.
 * @csspart root - The outer container.
 * @csspart toggle - The expand/collapse button.
 * @csspart content - The collapsible content region.
 */
export declare class VioletReasoningBlock extends FASTElement {
    expanded: boolean;
    state: string;
    label: string;
    constructor();
    connectedCallback(): void;
    toggleExpanded(): void;
}
export type VioletReasoningState = "streaming" | "done";