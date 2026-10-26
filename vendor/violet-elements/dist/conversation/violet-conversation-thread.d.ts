import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet conversation thread container.
 *
 * @summary Semantic transcript container with scroll management, live region
 *          semantics, and auto-scroll behavior for chat message display.
 * @slot - Message children (violet-message elements).
 * @slot empty - Content shown when the empty attribute is set.
 * @csspart scroll-region - The scrollable container.
 * @csspart content - The inner content wrapper with spacing.
 * @csspart empty - The empty state container.
 */
export declare class VioletConversationThread extends FASTElement {
    #private;
    busy: boolean;
    empty: boolean;
    isOverflowing: boolean;
    userScrolledAway: boolean;
    constructor();
    connectedCallback(): void;
    scrollToBottom(): void;
    handleScroll(_event: Event): void;
    disconnectedCallback(): void;
}