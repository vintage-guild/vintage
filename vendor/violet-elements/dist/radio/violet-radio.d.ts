import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet reusable radio primitive.
 *
 * @summary Token-driven radio option with label and optional supporting text.
 * @fires change - Emitted when the radio becomes checked through user interaction.
 * @slot - Radio label content.
 * @slot supporting - Optional supporting copy rendered under the label.
 * @csspart root - Root label wrapper.
 * @csspart control - Visible radio control.
 * @csspart mark - Selection dot inside the control.
 * @csspart label - Primary label text wrapper.
 * @csspart supporting-text - Optional supporting text wrapper.
 */
export declare class VioletRadio extends FASTElement {
    #private;
    hasSupporting: boolean;
    hasLabel: boolean;
    /**
     * Checked state for the radio.
     */
    checked: boolean;
    /**
     * Disables the radio.
     */
    disabled: boolean;
    /**
     * Presents a compact inline layout that can collapse to the control only.
     */
    inline: boolean;
    /**
     * Marks the radio as invalid.
     */
    invalid: boolean;
    /**
     * Native group name forwarded from a parent radio group when available.
     */
    name: string;
    /**
     * Submitted value associated with this radio.
     */
    value: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get effectiveDisabled(): boolean;
    setCheckedFromGroup(checked: boolean): void;
    setGroupDisabled(disabled: boolean): void;
    setManagedTabIndex(tabIndex: number | null): void;
    handleClick(event: Event): void;
    handleDefaultSlotChange(): void;
    handleSupportingSlotChange(): void;
    checkedChanged(): void;
    disabledChanged(): void;
    invalidChanged(): void;
    valueChanged(): void;
    get controlAriaLabel(): string | null;
    handleKeydown: (event: KeyboardEvent) => void;
}