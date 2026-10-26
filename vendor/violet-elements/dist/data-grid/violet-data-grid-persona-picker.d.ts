import { FASTElement } from "@lushly-dev/fast-element";
import "../listbox/violet-listbox";
import "../option/violet-option";
import "../persona/violet-persona";
import type { VioletDataGridEditorOption } from "./violet-data-grid";
type VioletDataGridPersonaPickerSelectedEntry = {
    label: string;
    option: VioletDataGridEditorOption | null;
    value: string;
};
/**
 * Compact assignee picker for dense grid cells.
 *
 * @summary Grid-native persona picker with searchable assignees, compact avatar stacks, and deferred commit on close.
 * @fires input - Emitted whenever the pending assignee selection changes while the panel is open.
 * @fires change - Emitted when the current pending assignee selection is committed by closing the picker.
 * @csspart base - Root wrapper for the persona picker.
 * @csspart trigger - Trigger button that opens the option list.
 * @csspart selection - Visible selection surface rendered inside the trigger.
 * @csspart overflow-pill - Overflow count chip when more assignees are selected than can be shown inline.
 * @csspart caret - Caret icon inside the trigger.
 * @csspart panel - Floating option panel.
 * @csspart search - Search input inside the panel.
 * @csspart selection-summary - Compact summary row describing the current assignee count.
 * @csspart listbox - Selection listbox surface inside the panel.
 * @csspart empty-state - Empty message shown when the current filter has no matches.
 */
export declare class VioletDataGridPersonaPicker extends FASTElement {
    #private;
    placeholder: string;
    disabled: boolean;
    multiple: boolean;
    selectedValues: string[];
    options: VioletDataGridEditorOption[];
    open: boolean;
    filterQuery: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    disabledChanged(): void;
    handlePanelToggle(event: ToggleEvent): void;
    handlePanelKeydown(event: KeyboardEvent): void;
    get value(): string;
    set value(nextValue: string);
    get panelId(): string;
    get selectedEntries(): VioletDataGridPersonaPickerSelectedEntry[];
    get visibleSelectedEntries(): VioletDataGridPersonaPickerSelectedEntry[];
    get overflowCount(): number;
    get selectionLabel(): string;
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
    private syncSelectionFromValue;
    private applySelection;
    private orderedSelectedValues;
    private close;
    private openPanel;
    private queueOpenFocus;
    private focusTrigger;
    private panelElement;
    private startPanelTracking;
    private stopPanelTracking;
    private positionPanel;
    private focusSearch;
    private focusListboxControl;
    private triggerElement;
    private searchElement;
    private listboxElement;
}
export {};