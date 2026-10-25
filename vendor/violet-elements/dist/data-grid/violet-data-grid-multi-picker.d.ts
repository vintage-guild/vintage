import { FASTElement } from "@lushly-dev/fast-element";
import "../listbox/violet-listbox";
import "../option/violet-option";
import type { VioletDataGridEditorOption } from "./violet-data-grid";
type VioletDataGridMultiPickerSelectedEntry = {
    label: string;
    option: VioletDataGridEditorOption | null;
    value: string;
};
/**
 * Compact multi-select editor for dense grid cells.
 *
 * @summary Grid-native multi picker with searchable options, inline chip previews, and deferred commit on close.
 * @fires input - Emitted whenever the pending selected values change while the panel is open.
 * @fires change - Emitted when the current pending selection is committed by closing the picker.
 * @csspart base - Root wrapper for the multi picker.
 * @csspart trigger - Trigger button that opens the option list.
 * @csspart selection - Visible selection surface rendered inside the trigger.
 * @csspart pill - Styled pill preview for each visible selected value.
 * @csspart overflow-pill - Overflow count pill when more values are selected than can be shown inline.
 * @csspart caret - Caret icon inside the trigger.
 * @csspart panel - Floating option panel.
 * @csspart search - Search input inside the panel.
 * @csspart selection-summary - Compact summary row describing the current selection count.
 * @csspart listbox - Multiple-selection listbox surface inside the panel.
 * @csspart empty-state - Empty message shown when the current filter has no matches.
 */
export declare class VioletDataGridMultiPicker extends FASTElement {
    #private;
    placeholder: string;
    disabled: boolean;
    selectedValues: string[];
    options: VioletDataGridEditorOption[];
    open: boolean;
    filterQuery: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    get value(): string;
    set value(nextValue: string);
    get panelId(): string;
    get listboxId(): string;
    disabledChanged(): void;
    handlePanelToggle(event: ToggleEvent): void;
    filterQueryChanged(): void;
    get selectedEntries(): VioletDataGridMultiPickerSelectedEntry[];
    get visibleSelectedEntries(): VioletDataGridMultiPickerSelectedEntry[];
    get overflowCount(): number;
    get selectionSummary(): string;
    get filteredOptions(): VioletDataGridEditorOption[];
    handleTriggerClick(): void;
    handleTriggerKeydown(event: KeyboardEvent): void;
    handleSearchInput(event: Event): void;
    handleSearchKeydown(event: KeyboardEvent): void;
    handleListboxInput(event: Event): void;
    handleListboxChange(event: Event): void;
    handleListboxKeydown(event: KeyboardEvent): void;
    toggleValue(value: string): void;
    toggleOption(value: string): void;
    isSelected(value: string): boolean;
    pillStyleForValue(value: string): string;
    optionSwatchStyle(option: VioletDataGridEditorOption): string;
    private syncSelectionFromValue;
    private applySelection;
    private orderedSelectedValues;
    private optionStyle;
    private close;
    private openPanel;
    private queueOpenFocus;
    private focusTrigger;
    private removeViewportListeners;
    private panelElement;
    private positionPanel;
    private focusSearch;
    private focusListboxControl;
    private triggerElement;
    private searchElement;
    private listboxElement;
}
export {};