import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet chat suggestions.
 *
 * @summary Prompt starter chip row. Children are rendered as clickable
 *          suggestion chips that fire a select event.
 * @slot - Suggestion chip elements (buttons or custom elements).
 * @csspart root - The chip container.
 * @fires select - When a suggestion is clicked. Detail: { text }.
 */
export declare class VioletChatSuggestions extends FASTElement {
    orientation: string;
    constructor();
    connectedCallback(): void;
    handleClick(event: Event): void;
    handleKeydown(event: KeyboardEvent): void;
    private ensureChipRoles;
    private focusNextChip;
}