import { type ContentTemplate, FASTElement } from "@lushly-dev/fast-element";
import { type VirtualItem } from "@tanstack/virtual-core";
import "../checkbox/violet-checkbox";
import "../icon/violet-icon";
import "../radio/violet-radio";
import "../text-field/violet-text-field";
export type VioletDataGridAlignment = "start" | "center" | "end";
export type VioletDataGridSelectionMode = "none" | "single" | "multiple";
export type VioletDataGridDensity = "compact" | "natural" | "comfortable";
export type VioletDataGridSortDirection = "ascending" | "descending";
export type VioletDataGridSortMode = "local" | "external";
export type VioletDataGridFocusMode = "row" | "cell";
export type VioletDataGridEditor = "text" | "number" | "checkbox" | "select" | "custom";
export interface VioletDataGridEditorOption {
    label: string;
    value: string;
    description?: string;
    src?: string;
    initials?: string;
    tone?: "green" | "teal" | "olive" | "gold" | "blue" | "gray";
    background?: string;
    foreground?: string;
    borderColor?: string;
    keywords?: string[];
}
export interface VioletDataGridCellTemplateContext<RowData = unknown> {
    rowId: string;
    rowLabel: string;
    columnId: string;
    columnLabel: string;
    rowData: RowData;
    rawValue: unknown;
    text: string;
    active: boolean;
    selected: boolean;
    editable: boolean;
    editing: boolean;
    fillPreview: boolean;
    editValue?: string;
    editingError?: string;
    editingErrorId?: string;
    editorOptions?: VioletDataGridEditorOption[];
}
export type VioletDataGridCellTemplate<RowData = unknown> = ContentTemplate;
export type VioletDataGridCellEditorTemplate<RowData = unknown> = ContentTemplate;
export interface VioletDataGridColumn<RowData = unknown> {
    id: string;
    label: string;
    sortable?: boolean;
    filterable?: boolean;
    editable?: boolean;
    editor?: VioletDataGridEditor;
    width?: string;
    align?: VioletDataGridAlignment;
    cellPart?: string;
    headerPart?: string;
    value?: (row: RowData) => unknown;
    render?: (row: RowData) => unknown;
    cellTemplate?: VioletDataGridCellTemplate<RowData>;
    editorTemplate?: VioletDataGridCellEditorTemplate<RowData>;
    editorOptions?: VioletDataGridEditorOption[] | ((row: RowData) => VioletDataGridEditorOption[]);
    serialize?: (value: unknown, row: RowData) => string;
    parse?: (value: unknown, row: RowData) => unknown;
}
export interface VioletDataGridRow<RowData = unknown> {
    id: string;
    /** Human-readable row identity used in interactive control names. */
    label?: string;
    data: RowData;
}
export interface VioletDataGridSort {
    columnId: string;
    direction: VioletDataGridSortDirection;
}
export interface VioletDataGridFilterState {
    query?: string;
}
export interface VioletDataGridCellLocation {
    rowId: string;
    columnId: string;
}
export interface VioletDataGridCellRange {
    anchor: VioletDataGridCellLocation;
    focus: VioletDataGridCellLocation;
}
export interface VioletDataGridChangeDetail {
    rowId: string;
    columnId: string;
    value: unknown;
}
export interface VioletDataGridCopyDetail {
    cells: VioletDataGridCellLocation[];
    text: string;
}
export interface VioletDataGridPasteDetail {
    origin: VioletDataGridCellLocation;
    text: string;
    changes: VioletDataGridChangeDetail[];
}
export interface VioletDataGridFillDetail {
    source: VioletDataGridCellRange;
    target: VioletDataGridCellRange;
    changes: VioletDataGridChangeDetail[];
}
export interface VioletDataGridColumnWidthDetail {
    columnId: string;
    width: string;
}
interface VioletPresentedColumn<RowData = unknown> {
    id: string;
    label: string;
    sortable: boolean;
    width?: string;
    widthStyle: string;
    align: VioletDataGridAlignment;
    headerPart?: string;
    headerPartText: string;
    cellPart?: string;
    cellPartText: string;
    source: VioletDataGridColumn<RowData>;
}
interface VioletPresentedCell {
    rowId: string;
    rowLabel: string;
    columnId: string;
    columnLabel: string;
    rowData: unknown;
    align: VioletDataGridAlignment;
    rawValue: unknown;
    text: string;
    widthStyle: string;
    cellId: string;
    active: boolean;
    selected: boolean;
    rangeEdge: string;
    editable: boolean;
    editor: VioletDataGridEditor;
    editing: boolean;
    editValue: string;
    editingError: string;
    editingErrorId: string;
    fillPreview: boolean;
    cellPart?: string;
    cellPartText: string;
    resolvedCellPartText: string;
    cellTemplate?: VioletDataGridCellTemplate<unknown>;
    editorTemplate?: VioletDataGridCellEditorTemplate<unknown>;
    editorOptions: VioletDataGridEditorOption[];
    parse?: (value: unknown, row: unknown) => unknown;
}
interface VioletPresentedRow<RowData = unknown> {
    id: string;
    label: string;
    data: RowData;
    cells: VioletPresentedCell[];
}
interface VioletRenderedRow {
    item: VirtualItem;
    row: VioletPresentedRow;
}
/**
 * Violet reusable data grid component.
 *
 * @summary Semantic table-first data grid for FAST-AF and Violet.
 * @fires sort-change - Emitted when the user changes sort intent.
 * @fires selection-change - Emitted when row selection changes.
 * @fires filter-change - Emitted when the built-in filter input changes.
 * @fires active-cell-change - Emitted when the active cell changes in cell focus mode.
 * @fires cell-selection-change - Emitted when the rectangular cell selection changes.
 * @fires cell-copy - Emitted when an active cell or current range is copied.
 * @fires cell-paste - Emitted when pasted text is mapped onto editable cells.
 * @fires cell-fill - Emitted when an autofill drag maps source cells onto a larger target range.
 * @fires column-width-change - Emitted when a column width is resized or autosized.
 * @fires edit-start - Emitted when a cell enters edit mode.
 * @fires edit-cancel - Emitted when a cell edit is cancelled.
 * @fires cell-change - Emitted when a cell edit is committed.
 * @remarks Virtualized mode uses TanStack Virtual core. The density-aware estimate bootstraps layout,
 * then rendered rows are measured so theme target sizes and expanded cell controls remain aligned.
 * @slot - Optional default slot rendered above the table region.
 * @slot toolbar - Optional toolbar content rendered alongside grid metadata.
 * @slot empty - Content rendered when no rows are available.
 * @slot loading - Content rendered while the grid is busy.
 * @csspart toolbar - Toolbar wrapper for filter and toolbar actions.
 * @csspart table - Root semantic table element.
 * @csspart head - Table head region.
 * @csspart body - Table body region.
 * @csspart header-row - Header row wrapper.
 * @csspart header-cell - Header cell surface.
 * @csspart row - Body row wrapper.
 * @csspart cell - Body cell surface.
 * @csspart active-cell - Active cell state hook.
 * @csspart fill-preview-cell - Autofill preview cell hook.
 * @csspart selected-cell - Selected range cell state hook.
 * @csspart selected-range-edge - Selected range boundary hook.
 * @csspart edit-status - Visible live status for edit lifecycle feedback.
 * @csspart empty-state - Empty-state container.
 * @csspart loading-state - Busy/loading overlay container.
 * @cssproperty --violet-data-grid-default-column-width - Width used when a column has no explicit width.
 * @cssproperty --violet-data-grid-virtualized-max-block-size - Optional maximum virtual viewport height;
 * set to `none` when the grid should fill a definite-height parent.
 */
export declare class VioletDataGrid extends FASTElement {
    #private;
    /**
     * Selection behavior for the grid.
     * Uses reflected primitive attribute state for HTML configuration.
     */
    selectionMode: VioletDataGridSelectionMode;
    /**
     * Enables sticky table headers.
     */
    stickyHeader: boolean;
    /**
     * Marks the grid as busy and shows the loading overlay.
     */
    busy: boolean;
    /**
   * Enables windowed row rendering for large data sets.
     */
    virtualize: boolean;
    /**
     * Density variant for the grid row spacing.
     */
    density: VioletDataGridDensity;
    /**
     * Keyboard navigation mode for the grid surface.
     */
    focusMode: VioletDataGridFocusMode;
    /**
     * Sorting behavior for the grid.
     * Local mode reorders rows in the component, external mode only reflects sort state and emits intent.
     */
    sortMode: VioletDataGridSortMode;
    /**
     * Column definitions for the grid.
     */
    columns: VioletDataGridColumn[];
    /**
     * Optional persisted width overrides keyed by column identifier.
     */
    columnWidths: Record<string, string>;
    /**
     * Row data for the grid.
     */
    rows: VioletDataGridRow[];
    /**
     * Enables the built-in filter field in the toolbar.
     */
    showFilter: boolean;
    /**
     * Current sort descriptor.
     */
    sort: VioletDataGridSort | null;
    /**
     * Optional built-in filter state.
     */
    filterState: VioletDataGridFilterState;
    /**
     * Controlled or uncontrolled selected row identifiers.
     */
    selectedRowIds: string[];
    presentedColumns: VioletPresentedColumn[];
    presentedRows: VioletPresentedRow[];
    renderedRows: VioletRenderedRow[];
    /**
     * Currently active data cell when cell focus mode is enabled.
     */
    activeCell: VioletDataGridCellLocation | null;
    /**
     * Current rectangular cell selection when range selection is active.
     */
    cellSelection: VioletDataGridCellRange | null;
    /**
     * Cell currently being edited.
     */
    editingCell: VioletDataGridCellLocation | null;
    editingValue: string;
    /** Accessible validation explanation for the active editor. */
    editingError: string;
    /** Visible live feedback for terminal edit lifecycle events. */
    editAnnouncement: string;
    fillPreview: VioletDataGridCellRange | null;
    /**
   * Initial row-height estimate used before mounted rows are measured.
   * Defaults to the active density target (24px compact, 32px natural, 44px comfortable).
     */
    estimatedRowHeight: number;
    /**
     * Number of rows to render outside the viewport in virtualized mode.
     */
    overscanCount: number;
    virtualPaddingStart: number;
    virtualPaddingEnd: number;
    virtualTotalSize: number;
    hasToolbarSlotContent: boolean;
    private readonly instanceId;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    selectionModeChanged(): void;
    stickyHeaderChanged(): void;
    busyChanged(): void;
    virtualizeChanged(): void;
    focusModeChanged(): void;
    sortModeChanged(): void;
    columnsChanged(): void;
    columnWidthsChanged(): void;
    rowsChanged(): void;
    showFilterChanged(): void;
    sortChanged(): void;
    selectedRowIdsChanged(): void;
    activeCellChanged(): void;
    cellSelectionChanged(): void;
    editingCellChanged(): void;
    fillPreviewChanged(): void;
    estimatedRowHeightChanged(): void;
    densityChanged(): void;
    overscanCountChanged(): void;
    get hasRows(): boolean;
    get columnSpan(): number;
    get logicalRowCount(): number;
    get logicalColumnCount(): number;
    get selectionHeaderId(): string;
    columnHeaderIdFor(columnId: string): string;
    get filterQuery(): string;
    get showsBuiltInFilter(): boolean;
    get shouldShowToolbar(): boolean;
    get activeCellLabelId(): string;
    get activeCellDescription(): string;
    get rowSummary(): string;
    get selectionHeaderLabel(): string;
    get selectionControlName(): string;
    get allRowsSelected(): boolean;
    get partiallySelected(): boolean;
    sortStateFor(columnId: string): string;
    sortDirectionFor(columnId: string): string;
    isSortedColumn(columnId: string): boolean;
    sortIconNameFor(columnId: string): string;
    isRowSelected(rowId: string): boolean;
    selectionLabelFor(rowId: string, rowLabel?: string): string;
    handleToolbarSlotChange(event: Event): void;
    handleFilterInput(event: Event): void;
    handleSelectionControlPointerDown(event: PointerEvent): void;
    handleSelectionControlClick(event: Event): void;
    handleToggleAllCheckboxClick(event: Event): void;
    handleRowCheckboxClick(rowId: string, event: Event): void;
    handleCellCheckboxClick(rowId: string, columnId: string, event: Event): void;
    handleGridFocus(): void;
    /**
     * Returns true to let the browser perform the key's default action.
     *
     * FAST cancels the default action of any `@event` binding whose expression
     * does not return exactly `true` (`HTMLBindingDirective.handleEvent`). A
     * `void` return therefore cancels every keystroke, including characters and
     * Backspace typed into an open cell editor. Return false only for keys this
     * handler consumes.
     */
    handleGridKeydown(event: KeyboardEvent): boolean;
    handleGridClick(event: Event): boolean;
    handleGridDoubleClick(event: MouseEvent): boolean;
    handleGridPointerDown(event: PointerEvent): boolean;
    handleGridPointerMove(event: PointerEvent): void;
    handleGridPointerUp(event: PointerEvent): void;
    handleGridPointerCancel(event: PointerEvent): void;
    handleGridInput(event: Event): void;
    handleGridChange(event: Event): void;
    handleGridPaste(event: ClipboardEvent): void;
    handleGridFocusOut(event: Event): void;
    handleCopyRequest(): Promise<void>;
    handleSortRequest(columnId: string): void;
    handleColumnResizePointerDown(columnId: string, event: PointerEvent): void;
    handleColumnResizePointerMove(event: PointerEvent): void;
    handleColumnResizePointerUp(event: PointerEvent): void;
    handleColumnResizePointerCancel(event: PointerEvent): void;
    handleColumnResizeDoubleClick(columnId: string, event: MouseEvent): void;
    handleToggleAll(event: Event): void;
    handleRowSelection(rowId: string, event: Event): void;
    handleCellPointerActivate(rowId: string, columnId: string, extendRange?: boolean): void;
    private updateSelection;
    private clearRangeSelectionState;
    private commitColumnWidth;
    private endColumnResize;
    private schedulePresentationRefresh;
    private refreshPresentation;
    private createPresentedColumn;
    private createPresentedRow;
    private updateInteractionState;
    private withInteractionState;
    private resolvedColumnWidth;
    private renderedColumnWidth;
    private minimumColumnWidth;
    private applyLiveColumnWidth;
    private headerCellElement;
    private autosizedColumnWidth;
    private cellValueFor;
    private editorOptionsForColumn;
    private serializeCellValue;
    private sortRows;
    private sortKeyFor;
    private syncActiveCell;
    private syncCellSelection;
    private syncFillPreview;
    private syncEditingCell;
    private firstCellLocation;
    private nextCellLocationForKey;
    private setActiveCell;
    private startEditingCell;
    private opensOnSingleActiveClick;
    /**
     * Commit the active edit synchronously.
     *
     * Returns true only when one session resolves. False means either there
     * was no edit or validation retained the same session; inspect
     * `editingCell` before and after when the distinction matters.
     */
    commitActiveEdit(): boolean;
    private commitEditingCell;
    private commitEditingCellAndMove;
    /** Cancel the active edit synchronously and emit `edit-cancel` once. */
    cancelActiveEdit(): boolean;
    private cancelEditingCell;
    private currentEditingSession;
    private clearEditingSession;
    private sameEditingLocation;
    private cancelEditIfSourceTargetInvalidated;
    private scheduleEditorRestore;
    private captureActiveEditorSelection;
    private captureEditorSelection;
    private restoreEditorSelection;
    private refocusActiveEditor;
    private isTargetWithinEditingOwnership;
    private ensureActiveCellVisible;
    private cellTextAt;
    private createCellSelection;
    private isValidCellLocation;
    private normalizedCellSelection;
    private visualSelectionBounds;
    private selectedCellLocations;
    private copyTextForLocations;
    private copyDetailForCurrentSelection;
    private pasteDetailForText;
    private normalizePastedText;
    private pasteOriginLocation;
    private pasteChangesForText;
    private currentFillSourceRange;
    private hasEditableCellsInRange;
    shouldShowFillHandleForCell(rowId: string, columnId: string): boolean;
    private currentFillSourceBounds;
    private boundsForRange;
    private rangeFromBounds;
    private locationForIndices;
    private beginFillDrag;
    private handleFillPointerMove;
    private handleFillPointerUp;
    private endFillDrag;
    private fillPreviewRangeForLocation;
    private clampFillBoundsToEditableTargets;
    private fillTargetLocationForPoint;
    private fillPreferredAxisForPoint;
    private rectForBounds;
    private fillDetailForPreview;
    private presentedCellAt;
    private editStringForCell;
    private normalizedEditingValue;
    private booleanCellValue;
    private nextTabCellLocation;
    private cellIndicesFor;
    private isEditingCell;
    private isEditorElement;
    private editorValueFromTarget;
    private isInteractiveCellWidgetTarget;
    private isCheckboxCellTarget;
    private commitCheckboxCellToggle;
    private isFillHandleTarget;
    private closestFromEventPath;
    private isEditorEvent;
    private isInteractiveCellWidgetEvent;
    private isCheckboxCellEvent;
    private isFillHandleEvent;
    isActiveCell(rowId: string, columnId: string): boolean;
    private locationFromTarget;
    private locationFromEvent;
    private cellElementFromTarget;
    private locationFromPointerEvent;
    private locationFromMouseEvent;
    private locationFromPointerEventLike;
    private nearestLocationForPoint;
    private locationWithinBounds;
    private locationFromCellElement;
    private cellElementForLocation;
    private endPointerSelection;
    cellIdFor(rowId: string, columnId: string): string;
    cellEditorErrorIdFor(rowId: string, columnId: string): string;
    private getActiveCellElement;
    private getActiveEditorElement;
    private sanitizeForId;
    private syncHostStates;
    private syncRenderedRows;
    private focusedSelectionControl;
    private selectionControlRowId;
    private restoreSelectionControlFocus;
    private interactionSnapshot;
    private scheduleRenderedRowMeasurement;
    private recycleFocusedRowIfNeeded;
    private scheduleVirtualizerUpdate;
    private getScrollContainer;
    private rowHeightForDensity;
    private toggleState;
    private mergePartNames;
}
export {};