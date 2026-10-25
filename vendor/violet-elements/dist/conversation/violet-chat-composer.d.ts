import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
import "../text-area/violet-text-area";
import type { VioletTextArea } from "../text-area/violet-text-area";
/**
 * Violet chat composer.
 *
 * @summary Prompt input shell with auto-growing textarea, submit/stop
 *          toggle, and optional action and footer slots.
 * @attr label - Programmatic label forwarded to the composer input.
 * @slot actions - Action buttons (attach file, etc.).
 * @slot footer - Below-input content (token count, model picker, etc.).
 * @csspart root - The outer container.
 * @csspart input - The textarea.
 * @csspart submit-button - The send button.
 * @csspart stop-button - The stop button (shown during streaming).
 * @csspart actions - The action button row.
 * @csspart footer - The footer area.
 * @fires submit - When the user submits a message. Detail: { text }.
 * @fires stop - When the user clicks stop during streaming.
 */
export declare class VioletChatComposer extends FASTElement {
    status: string;
    placeholder: string;
    label: string;
    disabled: boolean;
    value: string;
    hasInput: boolean;
    hasActions: boolean;
    hasFooter: boolean;
    constructor();
    connectedCallback(): void;
    get textAreaField(): VioletTextArea | null;
    get textareaEl(): HTMLTextAreaElement | null;
    get canSubmit(): boolean;
    handleKeydown(event: KeyboardEvent): boolean;
    handleInput(_event: Event): void;
    handleSubmit(): void;
    handleStop(): void;
    handleActionsSlotChange(): void;
    handleFooterSlotChange(): void;
    valueChanged(): void;
    syncInputState(): void;
    syncTextareaHeight(): void;
}
export type VioletChatComposerStatus = "ready" | "submitted" | "streaming" | "error";