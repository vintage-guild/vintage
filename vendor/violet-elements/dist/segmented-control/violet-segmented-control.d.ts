import { FASTElement } from "@lushly-dev/fast-element";
import "../segment/violet-segment";
import type { VioletSegment } from "../segment/violet-segment";
/**
 * Violet segmented control.
 *
 * @summary Token-driven single-selection choice group composed from `violet-segment` items.
 * @fires change - Emitted when the selected value changes.
 * @slot - `violet-segment` options rendered inside the group.
 * @csspart field - Field wrapper.
 * @csspart label - Group label text element.
 * @csspart group - Segmented surface wrapper.
 * @csspart supporting-text - Supporting text element.
 */
export declare class VioletSegmentedControl extends FASTElement {
    #private;
    static readonly formAssociated = true;
    segments: VioletSegment[];
    validationMessageText: string;
    label: string;
    supportingText: string;
    errorText: string;
    value: string;
    name: string;
    disabled: boolean;
    invalid: boolean;
    required: boolean;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    formResetCallback(): void;
    get form(): HTMLFormElement | null;
    get validity(): ValidityState;
    get validationMessage(): string;
    get willValidate(): boolean;
    checkValidity(): boolean;
    reportValidity(): boolean;
    handleSlotChange(): void;
    valueChanged(): void;
    labelChanged(): void;
    supportingTextChanged(): void;
    errorTextChanged(): void;
    nameChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    requiredChanged(): void;
    handleSelectRequest(event: CustomEvent<{
        value: string;
    }>): void;
    handleKeydown(event: KeyboardEvent): void;
}