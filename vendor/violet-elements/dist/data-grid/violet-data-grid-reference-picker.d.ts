import { FASTElement } from "@lushly-dev/fast-element";
import "../listbox/violet-listbox";
import "../option/violet-option";
import type { VioletDataGridEditorOption } from "./violet-data-grid";
type VioletDataGridReferencePickerSelectedEntry = {
    label: string;
    option: VioletDataGridEditorOption | null;
    value: string;
};
/**
 * Compact reference picker for linked-record style grid cells.
 *
 * @summary Grid-native reference picker with searchable linked records, secondary metadata, and optional create hooks.
 * @fires input - Emitted whenever the pending selected references change while the panel is open.
 * @fires change - Emitted when the current pending selection is committed by closing the picker.
 * @fires query-change - Emitted whenever the search query changes so the host can provide filtered options.
 * @fires create-request - Emitted when the create action is invoked for the current query.
 * @csspart base - Root wrapper for the reference picker.
 * @csspart trigger - Trigger button that opens the option list.
 * @csspart selection - Visible selection surface rendered inside the trigger.
 * @csspart pill - Styled linked-record pill preview for each visible selected reference.
 * @csspart overflow-pill - Overflow count pill when more references are selected than can be shown inline.
 * @csspart caret - Caret icon inside the trigger.
 * @csspart panel - Floating option panel.
 * @csspart search - Search input inside the panel.
 * @csspart selection-summary - Compact summary row describing the current linked-record count.
 * @csspart listbox - Selection listbox surface inside the panel.
 * @csspart create-action - Optional create action button shown for unmatched queries.
 * @csspart empty-state - Empty message shown when the current filter has no matches.
 */
export declare class VioletDataGridReferencePicker extends FASTElement {
    #private;
    placeholder: string;
    disabled: boolean;
    multiple: boolean;
    allowCreate: boolean;
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
    get selectedEntries(): VioletDataGridReferencePickerSelectedEntry[];
    get visibleSelectedEntries(): VioletDataGridReferencePickerSelectedEntry[];
    get overflowCount(): number;
    get selectionSummary(): string;
    get filteredOptions(): VioletDataGridEditorOption[];
    get hasCreateAction(): boolean;
    get createActionText(): string;
    handleTriggerClick(): void;
    handleTriggerKeydown(event: KeyboardEvent): void;
    handleSearchInput(event: Event): void;
    handleSearchKeydown(event: KeyboardEvent): void;
    handleListboxInput(event: Event): void;
    handleListboxChange(event: Event): void;
    handleListboxKeydown(event: KeyboardEvent): void;
    handleCreateAction(): void;
    toggleValue(value: string): void;
    toggleOption(value: string): void;
    isSelected(value: string): boolean;
    optionTokenStyle(option: VioletDataGridEditorOption): string;
    optionTokenText(option: VioletDataGridEditorOption): string;
    pillDotStyleForValue(value: string): string;
    private normalizedQuery;
    private syncSelectionFromValue;
    private applySelection;
    private orderedSelectedValues;
    private close;
    private openPanel;
    private queueOpenFocus;
    private focusTrigger;
    private removeViewportListeners;
    private panelElement;
    private positionPanel;
    private focusSearch;
    private focusListboxControl;
    private focusCreateAction;
    private triggerElement;
    private searchElement;
    private listboxElement;
    private createActionElement;
}
export {};