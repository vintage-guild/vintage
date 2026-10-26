import { FASTElement } from "@lushly-dev/fast-element";
import type { VioletDataGridEditorOption } from "./violet-data-grid";
/**
 * Compact single-select editor for grid cells.
 *
 * @summary Grid-native pill selector with searchable options and keyboard navigation.
 * @fires input - Emitted when the selected option changes.
 * @fires change - Emitted when the selected option is committed.
 * @attr error-announcement - Selects whether this component or an integrating surface announces validation errors.
 * @csspart base - Root wrapper for the pill select.
 * @csspart error-text - Accessible validation error text.
 * @csspart trigger - Trigger button that opens the option list.
 * @csspart pill - Visible selected-value pill.
 * @csspart caret - Caret icon inside the pill.
 * @csspart panel - Floating option panel.
 * @csspart search - Search input inside the panel.
 * @csspart options - Listbox-style option container.
 * @csspart option - Interactive option row.
 * @csspart option-pill - Styled pill surface for each option.
 */
export declare class VioletDataGridPillSelect extends FASTElement {
    #private;
    value: string;
    controlLabel: string;
    placeholder: string;
    /** Marks the focused trigger as invalid. */
    invalid: boolean;
    /** Validation explanation exposed from the focused trigger. */
    errorText: string;
    /** Owns live announcement unless an integrating surface provides the alert. */
    errorAnnouncement: "self" | "external";
    options: VioletDataGridEditorOption[];
    open: boolean;
    filterQuery: string;
    private readonly instanceId;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get selectedOption(): VioletDataGridEditorOption | null;
    get selectedLabel(): string;
    get triggerLabel(): string;
    get selectedOptionStyle(): string;
    get filteredOptions(): VioletDataGridEditorOption[];
    get panelId(): string;
    get errorTextId(): string;
    handleTriggerClick(): void;
    handleTriggerKeydown(event: KeyboardEvent): boolean;
    handleSearchInput(event: Event): boolean;
    handleSearchKeydown(event: KeyboardEvent): boolean;
    handleOptionKeydown(event: KeyboardEvent, value: string): boolean;
    handleFocusOut(event: FocusEvent): boolean;
    openChanged(): void;
    selectOption(value: string): void;
    optionStyle(option: VioletDataGridEditorOption): string;
    private close;
    private focusTrigger;
    private openPanel;
    private focusSearch;
    private focusOptionByIndex;
    private triggerElement;
    private searchElement;
    private optionElements;
    private selectedOptionIndex;
    private resolveOptionVisuals;
}