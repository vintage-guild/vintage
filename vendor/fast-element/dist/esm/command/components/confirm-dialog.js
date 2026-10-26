/**
 * ConfirmDialog component for command safety confirmations.
 * Modal dialog for confirming destructive actions.
 *
 * @remarks
 * Provides an accessible modal dialog with:
 * - open/prompt attributes for state management
 * - confirm/cancel events for user response
 * - Full ARIA support (role, aria-modal, aria-labelledby, aria-describedby)
 * - Focus trap to keep keyboard navigation within dialog
 * - Escape key to cancel
 *
 * @example
 * ```html
 * <fast-af-confirm-dialog
 *   open
 *   prompt="Are you sure you want to delete this item?"
 *   @confirm=${handleConfirm}
 *   @cancel=${handleCancel}
 * ></fast-af-confirm-dialog>
 * ```
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { FASTElementDefinition } from "../../components/fast-definitions.js";
import { FASTElement } from "../../components/fast-element.js";
import { attr } from "../../components/attributes.js";
import { html } from "../../templating/template.js";
import { css } from "../../styles/css.js";
import { when } from "../../templating/when.js";
/**
 * Styles for the confirm dialog component.
 * Uses CSS custom properties for theming.
 */
const styles = css `
    :host {
        display: none;
    }

    :host([open]) {
        display: block;
    }

    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--confirm-dialog-z-index, 1000);
    }

    .dialog {
        background: var(--confirm-dialog-background, #fff);
        border-radius: var(--confirm-dialog-border-radius, 8px);
        box-shadow: var(--confirm-dialog-shadow, 0 4px 24px rgba(0, 0, 0, 0.2));
        max-width: var(--confirm-dialog-max-width, 400px);
        width: 90%;
        padding: var(--confirm-dialog-padding, 24px);
    }

    .title {
        font-size: var(--confirm-dialog-title-size, 1.25rem);
        font-weight: var(--confirm-dialog-title-weight, 600);
        margin: 0 0 16px;
        color: var(--confirm-dialog-title-color, inherit);
    }

    .prompt {
        margin: 0 0 24px;
        color: var(--confirm-dialog-prompt-color, inherit);
        line-height: 1.5;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
    }

    button {
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, border-color 0.2s;
    }

    .cancel-button {
        background: var(--confirm-dialog-cancel-bg, transparent);
        border: 1px solid var(--confirm-dialog-cancel-border, #ccc);
        color: var(--confirm-dialog-cancel-color, inherit);
    }

    .cancel-button:hover {
        background: var(--confirm-dialog-cancel-hover-bg, #f5f5f5);
    }

    .cancel-button:focus-visible {
        outline: 2px solid var(--confirm-dialog-focus-color, #0066cc);
        outline-offset: 2px;
    }

    .confirm-button {
        background: var(--confirm-dialog-confirm-bg, #dc3545);
        border: 1px solid var(--confirm-dialog-confirm-border, #dc3545);
        color: var(--confirm-dialog-confirm-color, #fff);
    }

    .confirm-button:hover {
        background: var(--confirm-dialog-confirm-hover-bg, #c82333);
        border-color: var(--confirm-dialog-confirm-hover-border, #c82333);
    }

    .confirm-button:focus-visible {
        outline: 2px solid var(--confirm-dialog-focus-color, #0066cc);
        outline-offset: 2px;
    }

    /* Slot for custom content */
    ::slotted(*) {
        margin-bottom: 16px;
    }
`;
/**
 * Template for the confirm dialog component.
 */
const template = html `
    ${when(x => x.open, html `
            <div
                class="overlay"
                @click="${(x, c) => x.handleOverlayClick(c.event)}"
            >
                <div
                    class="dialog"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="dialog-title"
                    aria-describedby="dialog-prompt"
                    @click="${(x, c) => c.event.stopPropagation()}"
                    @keydown="${(x, c) => x.handleKeydown(c.event)}"
                >
                    <h2 id="dialog-title" class="title">
                        <slot name="title">Confirm Action</slot>
                    </h2>
                    <p id="dialog-prompt" class="prompt">${x => x.prompt}</p>
                    <slot></slot>
                    <div class="actions">
                        <button
                            type="button"
                            class="cancel-button"
                            @click="${x => x.handleCancel()}"
                        >
                            <slot name="cancel-text">Cancel</slot>
                        </button>
                        <button
                            type="button"
                            class="confirm-button"
                            @click="${x => x.handleConfirm()}"
                        >
                            <slot name="confirm-text">Confirm</slot>
                        </button>
                    </div>
                </div>
            </div>
        `)}
`;
/**
 * A modal dialog component for confirming destructive actions.
 *
 * Events: `confirm` is dispatched when the user confirms; `cancel` is dispatched
 * when the user cancels, presses Escape, or clicks the overlay.
 *
 * Slots: the default slot supplies additional content; `title`, `cancel-text`, and
 * `confirm-text` replace their corresponding labels.
 *
 * CSS parts: `overlay`, `dialog`, `title`, `prompt`, `actions`, `cancel-button`, and
 * `confirm-button`.
 *
 * @internal
 */
export class ConfirmDialog extends FASTElement {
    constructor() {
        super(...arguments);
        /**
         * Whether the dialog is open/visible.
         * @public
         */
        this.open = false;
        /**
         * The prompt message to display in the dialog.
         * @public
         */
        this.prompt = "";
        /**
         * Reference to the previously focused element for restoring focus on close.
         * @internal
         */
        this.previouslyFocused = null;
        /**
         * List of focusable elements within the dialog for focus trapping.
         * @internal
         */
        this.focusableElements = [];
    }
    /**
     * Called when the open attribute changes.
     * Manages focus trap and body scroll lock.
     * @param oldValue - Previous value
     * @param newValue - New value
     */
    openChanged(oldValue, newValue) {
        var _a;
        if (newValue) {
            this.previouslyFocused = document.activeElement;
            // Defer focus to allow template to render
            requestAnimationFrame(() => {
                this.trapFocus();
            });
            document.body.style.overflow = "hidden";
        }
        else {
            document.body.style.overflow = "";
            (_a = this.previouslyFocused) === null || _a === void 0 ? void 0 : _a.focus();
        }
    }
    /**
     * Sets up focus trap within the dialog.
     * @internal
     */
    trapFocus() {
        var _a;
        const dialog = (_a = this.shadowRoot) === null || _a === void 0 ? void 0 : _a.querySelector(".dialog");
        if (!dialog)
            return;
        // Get all focusable elements
        this.focusableElements = Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        // Focus the first button (cancel by default for safety)
        const cancelButton = dialog.querySelector(".cancel-button");
        cancelButton === null || cancelButton === void 0 ? void 0 : cancelButton.focus();
    }
    /**
     * Handles keydown events for focus trap and escape key.
     * @param event - The keyboard event
     * @internal
     */
    handleKeydown(event) {
        if (event.key === "Escape") {
            this.handleCancel();
            return;
        }
        if (event.key === "Tab") {
            this.handleTabKey(event);
        }
    }
    /**
     * Handles tab key for focus trapping.
     * @param event - The keyboard event
     * @internal
     */
    handleTabKey(event) {
        var _a;
        const focusable = this.focusableElements;
        if (focusable.length === 0)
            return;
        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        const activeElement = (_a = this.shadowRoot) === null || _a === void 0 ? void 0 : _a.activeElement;
        if (event.shiftKey) {
            // Shift+Tab: wrap to last element if on first
            if (activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        }
        else {
            // Tab: wrap to first element if on last
            if (activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }
    }
    /**
     * Handles overlay click to cancel.
     * @param event - The mouse event
     * @internal
     */
    handleOverlayClick(event) {
        // Only close if clicking the overlay itself, not the dialog
        if (event.target.classList.contains("overlay")) {
            this.handleCancel();
        }
    }
    /**
     * Handles confirm button click.
     * Emits 'confirm' event and closes the dialog.
     * @public
     */
    handleConfirm() {
        this.$emit("confirm");
        this.open = false;
    }
    /**
     * Handles cancel button click.
     * Emits 'cancel' event and closes the dialog.
     * @public
     */
    handleCancel() {
        this.$emit("cancel");
        this.open = false;
    }
}
__decorate([
    attr({ mode: "boolean" }),
    __metadata("design:type", Object)
], ConfirmDialog.prototype, "open", void 0);
__decorate([
    attr,
    __metadata("design:type", Object)
], ConfirmDialog.prototype, "prompt", void 0);
/**
 * The namespaced tag used by the opt-in confirmation dialog.
 * @public
 */
export const confirmDialogTagName = "fast-af-confirm-dialog";
let definitionPromise;
/**
 * Defines the confirmation dialog in the provided registry.
 *
 * @remarks
 * Registration is explicit so importing the command API remains side-effect free.
 * Repeated calls for the same registry are safe.
 *
 * @param registry - Registry in which to define the dialog.
 * @public
 */
export function defineConfirmDialog() {
    return __awaiter(this, arguments, void 0, function* (registry = customElements) {
        if (registry.get(confirmDialogTagName) !== undefined) {
            return;
        }
        definitionPromise !== null && definitionPromise !== void 0 ? definitionPromise : (definitionPromise = FASTElementDefinition.compose(ConfirmDialog, {
            name: confirmDialogTagName,
            template,
            styles,
        }));
        const definition = yield definitionPromise;
        definition.define(registry);
        yield registry.whenDefined(confirmDialogTagName);
    });
}
