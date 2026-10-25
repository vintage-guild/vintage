import { attr, FASTElement, html, observable, render, repeat, Updates, when, } from "@lushly-dev/fast-element";
import { elementScroll, observeElementOffset, observeElementRect, Virtualizer, } from "@tanstack/virtual-core";
import "../checkbox/violet-checkbox";
import "../icon/violet-icon";
import "../radio/violet-radio";
import "../text-field/violet-text-field";
import { registerSystemSortAscendingIcon } from "../icon/generated/icons/system-sort-ascending";
import { registerSystemSortDescendingIcon } from "../icon/generated/icons/system-sort-descending";
import { styles } from "./violet-data-grid.styles";
import { resolveCellPartText as composeCellPartText, isCellSelected as computeIsCellSelected, isFillPreviewCell as computeIsFillPreviewCell, rangeEdgeForCell as computeRangeEdgeForCell, } from "./violet-data-grid-cell-state";
import { defaultCellContentTemplate, inputCellEditorTemplate, selectCellEditorTemplate, } from "./violet-data-grid-cell-templates";
import { copyTextForSelection, normalizePastedText as normalizeGridPastedText, resolvePasteOriginLocation, sampleAutosizeRows, } from "./violet-data-grid-clipboard";
import { cellValueFor as resolveCellValue, editorOptionsForColumn as resolveEditorOptionsForColumn, serializeCellValue as serializeGridCellValue, sortRows as sortGridRows, stringifyCellValue, } from "./violet-data-grid-data";
import { beginEditingState, cancelEditingState as clearEditingState, editorStringValue, focusEditorAtEnd, seedEditorValue, } from "./violet-data-grid-editing";
import { cellElementFromEvent, cellElementFromTarget as eventCellElementFromTarget, closestFromEventPath as eventClosestFromEventPath, } from "./violet-data-grid-events";
import { buildFillChanges, buildPasteChanges, clampFillBoundsToEditableTargets as clampEditableFillBounds, hasEditableCellsInBounds, } from "./violet-data-grid-fill";
import { locationFromCellElement as geometryLocationFromCellElement, nearestLocationForPoint as nearestGeometryLocationForPoint, preferredAxisForPoint, rectFromCellPair, } from "./violet-data-grid-geometry";
import { createCellSelection as createNavigationCellSelection, firstCellLocation as resolveNavigationFirstCellLocation, nextCellLocationForKey as resolveNextCellLocationForKey, } from "./violet-data-grid-navigation";
import { clearedFillSession, clearedPointerSelectionSession, isFillPointerEventForSession, isPointerSelectionEventForSession, markPointerSelectionMoved, pointerSelectionSuppressesNextClick, beginFillDrag as startFillDragSession, beginPointerSelection as startPointerSelectionSession, } from "./violet-data-grid-pointer";
import { createPresentedColumn as buildPresentedColumn, createPresentedRow as buildPresentedRow, syncEditingState, syncActiveCell as syncPresentedActiveCell, syncCellSelection as syncPresentedCellSelection, syncFillPreview as syncPresentedFillPreview, } from "./violet-data-grid-presentation";
import { clearedColumnResizeSession, resizedColumnWidth as computeResizedColumnWidth, isColumnResizeEventForSession, beginColumnResize as startColumnResizeSession, } from "./violet-data-grid-resize";
import { nextTabLocation, selectedLocations, locationForIndices as selectionLocationForIndices, rangeFromBounds as selectionRangeFromBounds, } from "./violet-data-grid-selection";
import { autosizedColumnWidth as computeAutosizedColumnWidth, minimumColumnWidth as computeMinimumColumnWidth, renderedColumnWidth as computeRenderedColumnWidth, resolvedColumnWidth as resolveGridColumnWidth, } from "./violet-data-grid-sizing";
import { isCheckboxCellTarget as isGridCheckboxCellTarget, isEditorElement as isGridEditorElement, isFillHandleTarget as isGridFillHandleTarget, isInteractiveCellWidgetTarget as isGridInteractiveCellWidgetTarget, } from "./violet-data-grid-targets";
import { opensOnSingleActiveClick as editorOpensOnSingleActiveClick, editStringForRawValue, booleanCellValue as normalizeBooleanCellValue, normalizedEditingValue as normalizeEditingValue, resolveEditingValue, } from "./violet-data-grid-values";
import { buildVirtualizerUpdateOptions, buildRenderedRows as computeRenderedRows, } from "./violet-data-grid-virtualization";
registerSystemSortAscendingIcon();
registerSystemSortDescendingIcon();
const bodyRowTemplate = html `
    <tr
        part="row"
        data-index="${(x) => String(x.item.index)}"
        data-selected="${(x, c) => String(c.parent.isRowSelected(x.row.id))}"
        data-row-index="${(x) => String(x.item.index)}"
        aria-rowindex="${(x) => String(x.item.index + 2)}"
        aria-selected="${(x, c) => c.parent.selectionMode === "none" ? null : String(c.parent.isRowSelected(x.row.id))}"
    >
        <td
            class="selection-cell"
            part="cell"
            headers="${(_x, c) => c.parent.selectionHeaderId}"
            ?hidden="${(x, c) => c.parent.selectionMode === "none"}"
        >
            ${when((x, c) => c.parent.selectionMode === "single", html `
                    <violet-radio
                        class="selection-radio"
                        inline
                        value="${(x) => x.row.id}"
                        name="${(x, c) => c.parent.selectionControlName}"
                        aria-label="${(x, c) => c.parent.selectionLabelFor(x.row.id, x.row.label)}"
                        :checked="${(x, c) => c.parent.isRowSelected(x.row.id)}"
                        @pointerdown="${(x, c) => c.parent.handleSelectionControlPointerDown(c.event)}"
                        @click="${(x, c) => c.parent.handleSelectionControlClick(c.event)}"
                        @change="${(x, c) => c.parent.handleRowSelection(x.row.id, c.event)}"
                    ></violet-radio>
                `)}
            ${when((x, c) => c.parent.selectionMode === "multiple", html `
                    <violet-checkbox
                        class="selection-checkbox"
                        inline
                        aria-label="${(x, c) => c.parent.selectionLabelFor(x.row.id, x.row.label)}"
                        :checked="${(x, c) => c.parent.isRowSelected(x.row.id)}"
                        @pointerdown="${(x, c) => c.parent.handleSelectionControlPointerDown(c.event)}"
                        @click="${(x, c) => c.parent.handleRowCheckboxClick(x.row.id, c.event)}"
                    ></violet-checkbox>
                `)}
        </td>
        ${repeat((x) => x.row.cells, html `
                <td
                    id="${(x) => x.cellId}"
                    headers="${(x, c) => c.parentContext.parent.columnHeaderIdFor(x.columnId)}"
                    part="${(x) => x.resolvedCellPartText}"
                    data-align="${(x) => x.align}"
                    data-row-id="${(x) => x.rowId}"
                    data-column-id="${(x) => x.columnId}"
                    data-active="${(x) => String(x.active)}"
                    data-selected="${(x) => String(x.selected)}"
                    data-fill-preview="${(x) => String(x.fillPreview)}"
                    data-editing="${(x) => String(x.editing)}"
                    data-range-edge="${(x) => x.rangeEdge}"
                    style="${(x) => x.widthStyle}"
                >
                    ${when((x) => x.editing && (x.editor === "text" || x.editor === "number"), html `
                            <span class="cell-sizing-content" aria-hidden="true">
                                ${render((x) => x, (x) => x.cellTemplate ?? defaultCellContentTemplate)}
                            </span>
                            ${inputCellEditorTemplate}
                        `)}
                    ${when((x) => x.editing && x.editor === "select", html `
                            <span class="cell-sizing-content" aria-hidden="true">
                                ${render((x) => x, (x) => x.cellTemplate ?? defaultCellContentTemplate)}
                            </span>
                            ${selectCellEditorTemplate}
                        `)}
                    ${when((x) => x.editing && x.editor === "custom", html `
                            <span class="cell-sizing-content" aria-hidden="true">
                                ${render((x) => x, (x) => x.cellTemplate ?? defaultCellContentTemplate)}
                            </span>
                            ${render((x) => x, (x) => x.editorTemplate ?? defaultCellContentTemplate)}
                        `)}
                    ${when((x) => !x.editing && x.editor === "checkbox", html `
                            <span class="cell-widget" data-align="${(x) => x.align}">
                                <violet-checkbox
                                    class="cell-checkbox"
                                    data-cell-widget="checkbox"
                                    inline
                                    aria-label="${(x) => `${x.columnLabel} for ${x.rowLabel}`}"
                                    :checked="${(x) => normalizeBooleanCellValue(x.rawValue)}"
                                    ?disabled="${(x) => !x.editable}"
                                    @click="${(x, c) => c.parentContext.parent.handleCellCheckboxClick(x.rowId, x.columnId, c.event)}"
                                ></violet-checkbox>
                            </span>
                        `)}
                    ${when((x) => x.editing && Boolean(x.editingError), html `
                          <span
                              class="cell-editor-error"
                              id="${(x) => x.editingErrorId}"
                              role="alert"
                          >${(x) => x.editingError}</span>
                      `)}
                    ${when((x) => !x.editing && x.editor !== "checkbox", html `
                            ${render((x) => x, (x) => x.cellTemplate ?? defaultCellContentTemplate)}
                        `)}
                    ${when((x, c) => c.parentContext.parent.shouldShowFillHandleForCell(x.rowId, x.columnId), html `
                            <span class="fill-handle" data-fill-handle="true" aria-hidden="true"></span>
                        `)}
                </td>
            `)}
    </tr>
`;
const fullTableTemplate = html `
    <div class="table-canvas" style="--_virtual-total-size:${(x) => `${x.virtualTotalSize}px`};">
        <table
            class="table-full-table"
            part="table"
            aria-rowcount="${(x) => String(x.logicalRowCount)}"
            aria-colcount="${(x) => String(x.logicalColumnCount)}"
                >
        <colgroup>
            <col
                class="selection-column"
                style="${(x) => x.selectionMode === "none"
    ? "width:0;inline-size:0;min-inline-size:0;max-inline-size:0;"
    : "width:var(--_selection-column-size);inline-size:var(--_selection-column-size);min-inline-size:var(--_selection-column-size);max-inline-size:var(--_selection-column-size);"}"
            />
                ${repeat((x) => x.presentedColumns, html `
                    <col data-column-id="${(x) => x.id}" style="${(x) => x.widthStyle}" />
                `)}
        </colgroup>
        <thead part="head">
            <tr part="header-row">
                <th
                    id="${(x) => x.selectionHeaderId}"
                    class="selection-header"
                    part="header-cell"
                    scope="col"
                    aria-label="${(x) => x.selectionHeaderLabel}"
                    ?hidden="${(x) => x.selectionMode === "none"}"
                >
                    <span class="visually-hidden">${(x) => x.selectionHeaderLabel}</span>
                    ${when((x) => x.selectionMode === "multiple" && x.presentedRows.length > 0, html `
                            <violet-checkbox
                                class="selection-checkbox"
                                inline
                                aria-label="Select all rows"
                                :checked="${(x) => x.allRowsSelected}"
                                :indeterminate="${(x) => x.partiallySelected}"
                                @pointerdown="${(x, c) => x.handleSelectionControlPointerDown(c.event)}"
                                @click="${(x, c) => x.handleToggleAllCheckboxClick(c.event)}"
                            ></violet-checkbox>
                        `)}
                </th>
                ${repeat((x) => x.presentedColumns, html `
                        <th
                            id="${(x, c) => c.parent.columnHeaderIdFor(x.id)}"
                            part="${(x) => x.headerPartText}"
                            scope="col"
                            data-column-id="${(x) => x.id}"
                            data-align="${(x) => x.align}"
                            aria-sort="${(x, c) => c.parent.sortStateFor(x.id)}"
                            style="${(x) => x.widthStyle}"
                        >
                            ${when((x) => x.sortable, html `
                                    <button
                                        class="header-button"
                                        type="button"
                                        @click="${(x, c) => c.parent.handleSortRequest(x.id)}"
                                    >
                                        <span class="header-label">${(x) => x.label}</span>
                                        <violet-icon
                                            class="sort-indicator"
                                            data-sorted="${(x, c) => String(c.parent.isSortedColumn(x.id))}"
                                            icon="${(x, c) => c.parent.sortIconNameFor(x.id)}"
                                            decorative
                                        ></violet-icon>
                                    </button>
                                `)}
                            ${when((x) => !x.sortable, html `
                                    <span class="header-label">${(x) => x.label}</span>
                                `)}
                            <button
                                class="column-resizer"
                                type="button"
                                aria-label="${(x) => `Resize ${x.label} column`}"
                                data-column-resizer="${(x) => x.id}"
                                @pointerdown="${(x, c) => c.parent.handleColumnResizePointerDown(x.id, c.event)}"
                                @pointermove="${(x, c) => c.parent.handleColumnResizePointerMove(c.event)}"
                                @pointerup="${(x, c) => c.parent.handleColumnResizePointerUp(c.event)}"
                                @pointercancel="${(x, c) => c.parent.handleColumnResizePointerCancel(c.event)}"
                                @dblclick="${(x, c) => c.parent.handleColumnResizeDoubleClick(x.id, c.event)}"
                            ></button>
                        </th>
                    `)}
            </tr>
        </thead>
        <tbody part="body">
            <tr
                class="virtual-spacer-row"
                aria-hidden="true"
                ?hidden="${(x) => !x.virtualize || x.virtualPaddingStart <= 0}"
            >
                <td
                    colspan="${(x) => String(x.columnSpan)}"
                    style="block-size:${(x) => `${x.virtualPaddingStart}px`};"
                ></td>
            </tr>
            ${repeat((x) => x.renderedRows, bodyRowTemplate)}
            <tr
                class="virtual-spacer-row"
                aria-hidden="true"
                ?hidden="${(x) => !x.virtualize || x.virtualPaddingEnd <= 0}"
            >
                <td
                    colspan="${(x) => String(x.columnSpan)}"
                    style="block-size:${(x) => `${x.virtualPaddingEnd}px`};"
                ></td>
            </tr>
        </tbody>
    </table>
    </div>
`;
const template = html `
    <div class="grid-shell">
        ${when((x) => x.shouldShowToolbar, html `
                <div class="toolbar" part="toolbar">
                    ${when((x) => x.showsBuiltInFilter, html `
                            <div class="filter-shell">
                                <violet-text-field
                                    class="filter-field"
                                    aria-label="Filter rows"
                                    type="search"
                                    :value="${(x) => x.filterState.query ?? ""}"
                                    placeholder="Filter visible rows"
                                    @input="${(x, c) => x.handleFilterInput(c.event)}"
                                ></violet-text-field>
                            </div>
                        `)}
                    <div class="toolbar-meta">
                        <span>${(x) => x.rowSummary}</span>
                        <div class="toolbar-slot">
                            <slot
                                name="toolbar"
                                @slotchange="${(x, c) => x.handleToolbarSlotChange(c.event)}"
                            ></slot>
                        </div>
                    </div>
                </div>
            `)}

        <slot class="default-slot"></slot>

        <div class="table-region">
            <div
                class="edit-status"
                part="edit-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >${(x) => x.editAnnouncement}</div>
            ${when((x) => x.presentedRows.length > 0, html `
                    ${when((x) => true, html `
                            <div
                                class="table-scroll"
                                tabindex="${(x) => (x.focusMode === "cell" ? "0" : "-1")}"
                                aria-describedby="${(x) => (x.focusMode === "cell" ? x.activeCellLabelId : null)}"
                                @focus="${(x) => x.handleGridFocus()}"
                                @click="${(x, c) => x.handleGridClick(c.event)}"
                                @dblclick="${(x, c) => x.handleGridDoubleClick(c.event)}"
                                @pointerdown="${(x, c) => x.handleGridPointerDown(c.event)}"
                                @pointermove="${(x, c) => x.handleGridPointerMove(c.event)}"
                                @pointerup="${(x, c) => x.handleGridPointerUp(c.event)}"
                                @pointercancel="${(x, c) => x.handleGridPointerCancel(c.event)}"
                                @focusout="${(x, c) => x.handleGridFocusOut(c.event)}"
                                @input="${(x, c) => x.handleGridInput(c.event)}"
                                @change="${(x, c) => x.handleGridChange(c.event)}"
                                @paste="${(x, c) => x.handleGridPaste(c.event)}"
                                @keydown="${(x, c) => x.handleGridKeydown(c.event)}"
                            >
                                ${when((x) => x.focusMode === "cell", html `
                                        <span class="visually-hidden" id="${(x) => x.activeCellLabelId}">
                                            ${(x) => x.activeCellDescription}
                                        </span>
                                    `)}
                                ${fullTableTemplate}
                            </div>
                        `)}
                `)}

            ${when((x) => x.presentedRows.length === 0 && !x.busy, html `
                    <div class="empty-state" part="empty-state">
                        <slot name="empty">No rows available.</slot>
                    </div>
                `)}

            ${when((x) => x.busy, html `
                    <div class="loading-overlay" part="loading-state">
                        <slot name="loading">Loading rows...</slot>
                    </div>
                `)}
        </div>
    </div>
`;
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
export class VioletDataGrid extends FASTElement {
    #internals;
    #rowVirtualizer;
    #virtualizerCleanup;
    #virtualizerFrame;
    #rowMeasurementFrame;
    #pointerSelectionSession;
    #suppressNextGridClick;
    #fillSession;
    #lastCellClickLocation;
    #lastCellClickTimestamp;
    #columnResizeSession;
    #columnResizeHandle;
    #measurementCanvas;
    #rowIndexById;
    #columnIndexById;
    #selectedRowIdSet;
    #columnRevision;
    #rowPresentationCache;
    #baseCellsByPresentedRow;
    #sortKeyCache;
    #decoratedRowCache;
    #presentationRevision;
    #interactionRevision;
    #renderedPresentationRevision;
    #renderedInteractionRevision;
    #automaticEstimatedRowHeight;
    #settingAutomaticEstimatedRowHeight;
    #editorRecycleInProgress;
    #editorRecycleFocusFrame;
    #focusGeneration;
    #selectionControlFocusRevision;
    #editorRestoreFrame;
    #editingEditorElement;
    #nextEditingSessionId;
    #editingSession;
    #resolvingEditingSessionId;
    #presentationRetainingSessionId;
    #pendingEditorSelection;
    constructor() {
        super();
        this.instanceId = ++violetDataGridInstanceCount;
        this.#virtualizerCleanup = null;
        this.#virtualizerFrame = null;
        this.#rowMeasurementFrame = null;
        this.#pointerSelectionSession = clearedPointerSelectionSession();
        this.#suppressNextGridClick = false;
        this.#fillSession = clearedFillSession();
        this.#lastCellClickLocation = null;
        this.#lastCellClickTimestamp = 0;
        this.#columnResizeSession = clearedColumnResizeSession();
        this.#columnResizeHandle = null;
        this.#measurementCanvas = null;
        this.#rowIndexById = new Map();
        this.#columnIndexById = new Map();
        this.#selectedRowIdSet = new Set();
        this.#columnRevision = 0;
        this.#rowPresentationCache = new Map();
        this.#baseCellsByPresentedRow = new WeakMap();
        this.#sortKeyCache = new Map();
        this.#decoratedRowCache = new Map();
        this.#presentationRevision = 0;
        this.#interactionRevision = 0;
        this.#renderedPresentationRevision = -1;
        this.#renderedInteractionRevision = -1;
        this.#automaticEstimatedRowHeight = true;
        this.#settingAutomaticEstimatedRowHeight = false;
        this.#editorRecycleInProgress = false;
        this.#editorRecycleFocusFrame = null;
        this.#focusGeneration = 0;
        this.#selectionControlFocusRevision = 0;
        this.#editorRestoreFrame = null;
        this.#editingEditorElement = null;
        this.#nextEditingSessionId = 0;
        this.#editingSession = null;
        this.#resolvingEditingSessionId = null;
        this.#presentationRetainingSessionId = null;
        this.#pendingEditorSelection = null;
        this.#handleFocusIntent = () => {
            this.#focusGeneration += 1;
        };
        this.#internals = this.attachInternals();
        this.selectionMode = "none";
        this.stickyHeader = false;
        this.busy = false;
        this.virtualize = false;
        this.density = "natural";
        this.focusMode = "row";
        this.sortMode = "local";
        this.columns = [];
        this.columnWidths = {};
        this.rows = [];
        this.showFilter = false;
        this.sort = null;
        this.filterState = {};
        this.selectedRowIds = [];
        this.presentedColumns = [];
        this.presentedRows = [];
        this.renderedRows = [];
        this.activeCell = null;
        this.cellSelection = null;
        this.editingCell = null;
        this.editingValue = "";
        this.editingError = "";
        this.editAnnouncement = "";
        this.fillPreview = null;
        this.#settingAutomaticEstimatedRowHeight = true;
        this.estimatedRowHeight = this.rowHeightForDensity(this.density);
        this.#settingAutomaticEstimatedRowHeight = false;
        this.overscanCount = 5;
        this.virtualPaddingStart = 0;
        this.virtualPaddingEnd = 0;
        this.virtualTotalSize = 0;
        this.hasToolbarSlotContent = false;
        this.#rowVirtualizer = new Virtualizer({
            count: 0,
            getScrollElement: () => this.getScrollContainer(),
            estimateSize: () => this.estimatedRowHeight,
            scrollToFn: elementScroll,
            observeElementRect,
            observeElementOffset,
            overscan: this.overscanCount,
            getItemKey: (index) => this.presentedRows[index]?.id ?? index,
            enabled: false,
            onChange: () => {
                this.syncRenderedRows();
            },
        });
    }
    connectedCallback() {
        this.refreshPresentation();
        super.connectedCallback();
        this.ownerDocument.addEventListener("focusin", this.#handleFocusIntent, true);
        this.ownerDocument.addEventListener("pointerdown", this.#handleFocusIntent, true);
        this.#virtualizerCleanup ??= this.#rowVirtualizer._didMount();
        this.hasToolbarSlotContent = this.querySelector('[slot="toolbar"]') !== null;
        this.syncHostStates();
        this.scheduleVirtualizerUpdate();
    }
    disconnectedCallback() {
        // Consumers commit valid route transitions before detaching listeners.
        // Disconnect is the fail-safe terminal path for anything still active,
        // including invalid drafts that cannot remain in an invisible editor.
        this.cancelActiveEdit();
        this.ownerDocument.removeEventListener("focusin", this.#handleFocusIntent, true);
        this.ownerDocument.removeEventListener("pointerdown", this.#handleFocusIntent, true);
        if (this.#virtualizerFrame !== null) {
            cancelAnimationFrame(this.#virtualizerFrame);
            this.#virtualizerFrame = null;
        }
        if (this.#editorRecycleFocusFrame !== null) {
            cancelAnimationFrame(this.#editorRecycleFocusFrame);
            this.#editorRecycleFocusFrame = null;
        }
        this.#selectionControlFocusRevision += 1;
        if (this.#editorRestoreFrame !== null) {
            cancelAnimationFrame(this.#editorRestoreFrame);
            this.#editorRestoreFrame = null;
        }
        if (this.#rowMeasurementFrame !== null) {
            cancelAnimationFrame(this.#rowMeasurementFrame);
            this.#rowMeasurementFrame = null;
        }
        this.#rowVirtualizer.measureElement(null);
        this.#virtualizerCleanup?.();
        this.#virtualizerCleanup = null;
        super.disconnectedCallback();
    }
    selectionModeChanged() {
        if (this.selectionMode === "none") {
            this.selectedRowIds = [];
            return;
        }
        if (this.selectionMode === "single" && this.selectedRowIds.length > 1) {
            this.selectedRowIds = this.selectedRowIds.slice(0, 1);
        }
        this.updateInteractionState();
        this.scheduleVirtualizerUpdate();
    }
    stickyHeaderChanged() {
        this.syncHostStates();
    }
    busyChanged() {
        this.syncHostStates();
    }
    virtualizeChanged() {
        this.syncHostStates();
        this.syncRenderedRows();
        this.scheduleVirtualizerUpdate();
    }
    focusModeChanged() {
        if (this.focusMode !== "cell") {
            this.cancelActiveEdit();
            this.activeCell = null;
            this.cellSelection = null;
            this.fillPreview = null;
            return;
        }
        if (!this.activeCell && this.presentedRows.length > 0 && this.presentedColumns.length > 0) {
            this.activeCell = this.firstCellLocation();
        }
    }
    sortModeChanged() {
        this.schedulePresentationRefresh();
    }
    columnsChanged() {
        this.captureActiveEditorSelection();
        this.cancelEditIfSourceTargetInvalidated();
        this.#presentationRetainingSessionId = this.#editingSession?.id ?? null;
        this.#columnRevision += 1;
        this.#sortKeyCache.clear();
        this.schedulePresentationRefresh();
    }
    columnWidthsChanged() {
        this.#columnRevision += 1;
        this.schedulePresentationRefresh();
    }
    rowsChanged() {
        if (this.rows.length === 0) {
            this.editAnnouncement = "";
        }
        this.captureActiveEditorSelection();
        this.cancelEditIfSourceTargetInvalidated();
        this.#presentationRetainingSessionId = this.#editingSession?.id ?? null;
        this.#rowPresentationCache.clear();
        this.#sortKeyCache.clear();
        this.schedulePresentationRefresh();
    }
    showFilterChanged() {
        this.syncHostStates();
    }
    sortChanged() {
        this.commitActiveEdit();
        this.clearRangeSelectionState();
        this.schedulePresentationRefresh();
    }
    selectedRowIdsChanged() {
        this.#selectedRowIdSet = new Set(this.selectedRowIds ?? []);
        this.#interactionRevision += 1;
        this.syncRenderedRows();
    }
    activeCellChanged() {
        if (this.focusMode !== "cell") {
            return;
        }
        this.updateInteractionState();
        this.ensureActiveCellVisible();
        this.$emit("active-cell-change", this.activeCell);
    }
    cellSelectionChanged() {
        if (this.focusMode !== "cell") {
            return;
        }
        this.updateInteractionState();
        this.$emit("cell-selection-change", this.cellSelection);
    }
    editingCellChanged() {
        if (!this.editingCell) {
            this.#editingSession = null;
            this.editingError = "";
        }
        else if (!this.sameEditingLocation(this.#editingSession?.location, this.editingCell)) {
            this.#editingSession = {
                id: ++this.#nextEditingSessionId,
                location: { ...this.editingCell },
            };
            this.editingError = "";
        }
        this.updateInteractionState();
        if (!this.editingCell || !this.#editingSession) {
            return;
        }
        this.scheduleEditorRestore(this.#editingSession.id);
    }
    fillPreviewChanged() {
        if (this.focusMode !== "cell") {
            return;
        }
        this.updateInteractionState();
    }
    estimatedRowHeightChanged() {
        if (!this.#settingAutomaticEstimatedRowHeight) {
            this.#automaticEstimatedRowHeight = false;
        }
        this.syncRenderedRows();
        this.scheduleVirtualizerUpdate();
    }
    densityChanged() {
        if (this.#automaticEstimatedRowHeight) {
            this.#settingAutomaticEstimatedRowHeight = true;
            this.estimatedRowHeight = this.rowHeightForDensity(this.density);
            this.#settingAutomaticEstimatedRowHeight = false;
        }
        this.syncRenderedRows();
        this.scheduleVirtualizerUpdate();
    }
    overscanCountChanged() {
        this.syncRenderedRows();
        this.scheduleVirtualizerUpdate();
    }
    get hasRows() {
        return this.presentedRows.length > 0;
    }
    get columnSpan() {
        return this.presentedColumns.length + 1;
    }
    get logicalRowCount() {
        return this.presentedRows.length + 1;
    }
    get logicalColumnCount() {
        return this.presentedColumns.length + (this.selectionMode === "none" ? 0 : 1);
    }
    get selectionHeaderId() {
        return `${this.localName}-selection-header-${this.instanceId}`;
    }
    columnHeaderIdFor(columnId) {
        return `${this.localName}-header-${this.instanceId}-${this.sanitizeForId(columnId)}`;
    }
    get filterQuery() {
        return this.filterState.query ?? "";
    }
    get showsBuiltInFilter() {
        return this.showFilter;
    }
    get shouldShowToolbar() {
        return this.showsBuiltInFilter || this.hasToolbarSlotContent;
    }
    get activeCellLabelId() {
        return `${this.localName}-active-cell-${this.instanceId}`;
    }
    get activeCellDescription() {
        if (!this.activeCell) {
            return "No active cell.";
        }
        const rowIndex = this.#rowIndexById.get(this.activeCell.rowId) ?? -1;
        const columnIndex = this.#columnIndexById.get(this.activeCell.columnId) ?? -1;
        const columnLabel = this.presentedColumns[columnIndex]?.label ?? this.activeCell.columnId;
        const cellText = this.cellTextAt(this.activeCell) || "empty";
        return `Active cell row ${rowIndex + 1}, column ${columnLabel}, value ${cellText}.`;
    }
    get rowSummary() {
        const totalRows = this.presentedRows.length;
        const selectedRows = this.selectedRowIds.filter((id) => this.#rowIndexById.has(id)).length;
        if (this.selectionMode === "none") {
            return `${totalRows} row${totalRows === 1 ? "" : "s"}`;
        }
        return `${selectedRows} selected / ${totalRows} row${totalRows === 1 ? "" : "s"}`;
    }
    get selectionHeaderLabel() {
        if (this.selectionMode === "multiple") {
            return "Select rows";
        }
        return "Selected row";
    }
    get selectionControlName() {
        return `${this.localName}-selection-${this.instanceId}`;
    }
    get allRowsSelected() {
        const selectedRowIds = this.selectedRowIds ?? [];
        return (this.hasRows &&
            selectedRowIds.length >= this.presentedRows.length &&
            this.presentedRows.every((row) => this.#selectedRowIdSet.has(row.id)));
    }
    get partiallySelected() {
        const selectedRowIds = this.selectedRowIds ?? [];
        if (selectedRowIds.length === 0) {
            return false;
        }
        const selectedCount = this.presentedRows.filter((row) => this.#selectedRowIdSet.has(row.id)).length;
        return selectedCount > 0 && selectedCount < this.presentedRows.length;
    }
    sortStateFor(columnId) {
        if (!this.sort || this.sort.columnId !== columnId) {
            return "none";
        }
        return this.sort.direction;
    }
    sortDirectionFor(columnId) {
        if (!this.sort || this.sort.columnId !== columnId) {
            return "ascending";
        }
        return this.sort.direction;
    }
    isSortedColumn(columnId) {
        return this.sort?.columnId === columnId;
    }
    sortIconNameFor(columnId) {
        return this.sortDirectionFor(columnId) === "descending"
            ? "system/sort-descending"
            : "system/sort-ascending";
    }
    isRowSelected(rowId) {
        return this.#selectedRowIdSet.has(rowId);
    }
    selectionLabelFor(rowId, rowLabel) {
        return `Select row ${rowLabel?.trim() || rowId}`;
    }
    handleToolbarSlotChange(event) {
        const slot = event.target;
        this.hasToolbarSlotContent = Boolean(slot?.assignedNodes({ flatten: true }).length);
    }
    handleFilterInput(event) {
        const input = event.currentTarget;
        if (this.editingCell && !this.commitActiveEdit()) {
            if (input) {
                input.value = this.filterState.query ?? "";
            }
            this.refocusActiveEditor();
            return;
        }
        const nextState = {
            ...this.filterState,
            query: input?.value ?? "",
        };
        this.clearRangeSelectionState();
        this.filterState = nextState;
        this.$emit("filter-change", nextState);
    }
    handleSelectionControlPointerDown(event) {
        event.stopPropagation();
    }
    handleSelectionControlClick(event) {
        event.stopPropagation();
    }
    handleToggleAllCheckboxClick(event) {
        event.stopPropagation();
        const checkbox = event.currentTarget;
        const nextChecked = !this.allRowsSelected;
        if (checkbox) {
            checkbox.checked = nextChecked;
            if ("indeterminate" in checkbox) {
                checkbox.indeterminate = false;
            }
        }
        this.updateSelection(nextChecked ? this.presentedRows.map((row) => row.id) : []);
    }
    handleRowCheckboxClick(rowId, event) {
        event.stopPropagation();
        const checkbox = event.currentTarget;
        const nextChecked = !(checkbox?.checked ?? false);
        if (checkbox) {
            checkbox.checked = nextChecked;
            if ("indeterminate" in checkbox) {
                checkbox.indeterminate = false;
            }
        }
        const current = new Set(this.selectedRowIds);
        if (nextChecked) {
            current.add(rowId);
        }
        else {
            current.delete(rowId);
        }
        this.updateSelection([...current]);
    }
    handleCellCheckboxClick(rowId, columnId, event) {
        event.stopPropagation();
        const location = { rowId, columnId };
        if (this.editingCell &&
            !this.sameEditingLocation(this.editingCell, location) &&
            !this.commitActiveEdit()) {
            this.refocusActiveEditor();
            return;
        }
        const cell = this.presentedCellAt(location);
        if (!cell?.editable || cell.editor !== "checkbox") {
            return;
        }
        const checkbox = event.currentTarget;
        const nextChecked = !this.booleanCellValue(cell.rawValue);
        if (checkbox) {
            checkbox.checked = nextChecked;
            if ("indeterminate" in checkbox) {
                checkbox.indeterminate = false;
            }
        }
        this.commitCheckboxCellToggle(location, nextChecked);
    }
    handleGridFocus() {
        if (this.focusMode !== "cell" ||
            this.activeCell ||
            !this.presentedRows.length ||
            !this.presentedColumns.length) {
            return;
        }
        this.activeCell = this.firstCellLocation();
    }
    /**
     * Returns true to let the browser perform the key's default action.
     *
     * FAST cancels the default action of any `@event` binding whose expression
     * does not return exactly `true` (`HTMLBindingDirective.handleEvent`). A
     * `void` return therefore cancels every keystroke, including characters and
     * Backspace typed into an open cell editor. Return false only for keys this
     * handler consumes.
     */
    handleGridKeydown(event) {
        if (this.focusMode !== "cell") {
            return true;
        }
        if (event.isComposing || event.keyCode === 229) {
            return true;
        }
        const target = event.target;
        if (this.isEditorElement(target)) {
            if (event.key === "Enter") {
                event.preventDefault();
                if (this.commitActiveEdit()) {
                    this.getScrollContainer()?.focus({ preventScroll: true });
                }
                else {
                    this.refocusActiveEditor();
                }
                return false;
            }
            if (event.key === "Tab") {
                event.preventDefault();
                this.commitEditingCellAndMove(event.shiftKey ? -1 : 1);
                return false;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                this.cancelActiveEdit();
                this.getScrollContainer()?.focus({ preventScroll: true });
                return false;
            }
            // Every other key belongs to the editor: typing, Backspace, caret
            // movement. Cancelling here is what made cell editing impossible.
            return true;
        }
        if (target && target !== this.getScrollContainer()) {
            return true;
        }
        if (event.key === "Tab") {
            const currentCell = this.activeCell ?? this.firstCellLocation();
            if (!currentCell) {
                return true;
            }
            const nextLocation = this.nextTabCellLocation(currentCell, event.shiftKey ? -1 : 1);
            if (!nextLocation) {
                return true;
            }
            event.preventDefault();
            this.setActiveCell(nextLocation);
            return false;
        }
        if ((event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            !event.altKey &&
            event.key.toLowerCase() === "c") {
            event.preventDefault();
            void this.handleCopyRequest();
            return false;
        }
        if ((event.key === " " || event.key === "Spacebar" || event.key === "Enter") &&
            this.activeCell) {
            const activeCell = this.presentedCellAt(this.activeCell);
            if (activeCell?.editable && activeCell.editor === "checkbox") {
                event.preventDefault();
                this.commitCheckboxCellToggle(this.activeCell, !this.booleanCellValue(activeCell.rawValue));
                return false;
            }
        }
        if ((event.key === "Enter" || event.key === "F2") && this.activeCell) {
            const editableCell = this.presentedCellAt(this.activeCell);
            if (!editableCell?.editable) {
                return true;
            }
            event.preventDefault();
            this.startEditingCell(this.activeCell);
            return false;
        }
        const nextLocation = this.nextCellLocationForKey(event);
        if (!nextLocation) {
            return true;
        }
        event.preventDefault();
        this.setActiveCell(nextLocation, { extendRange: event.shiftKey });
        return false;
    }
    handleGridClick(event) {
        if (this.focusMode !== "cell") {
            return true;
        }
        if (this.#suppressNextGridClick) {
            this.#suppressNextGridClick = false;
            return true;
        }
        const target = event.target;
        if (this.isEditorEvent(event) ||
            this.isEditorElement(target) ||
            this.isInteractiveCellWidgetEvent(event) ||
            this.isInteractiveCellWidgetTarget(target)) {
            return true;
        }
        const pointerEvent = event;
        const location = this.locationFromMouseEvent(pointerEvent) ??
            this.locationFromEvent(event) ??
            this.locationFromTarget(target);
        if (!location) {
            if (pointerEvent.detail >= 2 && this.activeCell) {
                const activeCell = this.presentedCellAt(this.activeCell);
                if (activeCell?.editable && activeCell.editor !== "checkbox") {
                    this.startEditingCell(this.activeCell);
                }
            }
            return true;
        }
        if (this.editingCell &&
            !this.sameEditingLocation(this.editingCell, location) &&
            !this.commitActiveEdit()) {
            this.refocusActiveEditor();
            return true;
        }
        const sameActiveCell = this.activeCell?.rowId === location.rowId && this.activeCell?.columnId === location.columnId;
        const activeCell = this.presentedCellAt(location);
        if (sameActiveCell &&
            activeCell?.editable &&
            this.opensOnSingleActiveClick(activeCell.editor)) {
            this.startEditingCell(location);
            return true;
        }
        this.handleCellPointerActivate(location.rowId, location.columnId, pointerEvent.shiftKey);
        const timestamp = typeof pointerEvent.timeStamp === "number" ? pointerEvent.timeStamp : performance.now();
        const sameCellAsLastClick = this.#lastCellClickLocation?.rowId === location.rowId &&
            this.#lastCellClickLocation?.columnId === location.columnId;
        const withinDoubleClickWindow = timestamp - this.#lastCellClickTimestamp <= 350;
        if (pointerEvent.detail >= 2 || (sameCellAsLastClick && withinDoubleClickWindow)) {
            const cell = this.presentedCellAt(location);
            if (cell?.editable && cell.editor !== "checkbox") {
                this.startEditingCell(location);
            }
        }
        this.#lastCellClickLocation = location;
        this.#lastCellClickTimestamp = timestamp;
        return true;
    }
    handleGridDoubleClick(event) {
        if (this.focusMode !== "cell") {
            return true;
        }
        const target = event.target;
        if ((!target && !this.locationFromEvent(event)) ||
            this.isEditorEvent(event) ||
            this.isEditorElement(target) ||
            this.isInteractiveCellWidgetEvent(event) ||
            this.isInteractiveCellWidgetTarget(target) ||
            this.isFillHandleEvent(event) ||
            this.isFillHandleTarget(target)) {
            return true;
        }
        const location = this.locationFromMouseEvent(event) ??
            this.locationFromEvent(event) ??
            this.locationFromTarget(target);
        if (!location) {
            if (this.activeCell) {
                const activeCell = this.presentedCellAt(this.activeCell);
                if (activeCell?.editable && activeCell.editor !== "checkbox") {
                    event.preventDefault();
                    this.startEditingCell(this.activeCell);
                    return false;
                }
            }
            return true;
        }
        const cell = this.presentedCellAt(location);
        if (cell?.editor === "checkbox") {
            return true;
        }
        event.preventDefault();
        this.handleCellPointerActivate(location.rowId, location.columnId, false);
        this.startEditingCell(location);
        return false;
    }
    handleGridPointerDown(event) {
        if (this.focusMode !== "cell" ||
            event.button !== 0 ||
            event.shiftKey ||
            this.isEditorEvent(event) ||
            this.isEditorElement(event.target) ||
            this.isInteractiveCellWidgetEvent(event) ||
            this.isInteractiveCellWidgetTarget(event.target)) {
            return true;
        }
        if (this.isFillHandleEvent(event) || this.isFillHandleTarget(event.target)) {
            this.beginFillDrag(event);
            return false;
        }
        const location = this.locationFromEvent(event) ?? this.locationFromTarget(event.target);
        if (!location) {
            return true;
        }
        const scrollContainer = this.getScrollContainer();
        this.#pointerSelectionSession = startPointerSelectionSession(event.pointerId, location);
        this.setActiveCell(location);
        scrollContainer?.focus({ preventScroll: true });
        try {
            scrollContainer?.setPointerCapture(event.pointerId);
        }
        catch {
            // Synthetic Storybook pointer events do not always create a capturable pointer.
        }
        event.preventDefault();
        return false;
    }
    handleGridPointerMove(event) {
        if (isFillPointerEventForSession(this.#fillSession, event.pointerId)) {
            this.handleFillPointerMove(event);
            return;
        }
        const session = this.#pointerSelectionSession;
        if (this.focusMode !== "cell" || !isPointerSelectionEventForSession(session, event.pointerId)) {
            return;
        }
        const location = this.locationFromPointerEvent(event);
        if (!location) {
            return;
        }
        const anchor = session.anchor;
        if (!anchor) {
            return;
        }
        const currentFocus = this.cellSelection?.focus ?? anchor;
        if (currentFocus.rowId === location.rowId && currentFocus.columnId === location.columnId) {
            return;
        }
        this.#pointerSelectionSession = markPointerSelectionMoved(session);
        this.cellSelection = this.createCellSelection(anchor, location);
        this.updateInteractionState();
    }
    handleGridPointerUp(event) {
        if (isFillPointerEventForSession(this.#fillSession, event.pointerId)) {
            this.handleFillPointerUp();
            return;
        }
        if (!isPointerSelectionEventForSession(this.#pointerSelectionSession, event.pointerId)) {
            return;
        }
        this.endPointerSelection(true);
    }
    handleGridPointerCancel(event) {
        if (isFillPointerEventForSession(this.#fillSession, event.pointerId)) {
            this.endFillDrag(false);
            return;
        }
        if (!isPointerSelectionEventForSession(this.#pointerSelectionSession, event.pointerId)) {
            return;
        }
        this.endPointerSelection(false);
    }
    handleGridInput(event) {
        const target = event.target;
        if (!this.isEditorElement(target) || !this.editingCell) {
            return;
        }
        this.editingValue = this.editorValueFromTarget(target);
        if (this.editingError) {
            this.editingError = "";
            this.updateInteractionState();
            this.scheduleEditorRestore(this.#editingSession?.id ?? null);
        }
    }
    handleGridChange(event) {
        const target = event.target;
        if (this.isEditorElement(target) && this.editingCell) {
            this.editingValue = this.editorValueFromTarget(target);
            const cell = this.presentedCellAt(this.editingCell);
            if (cell?.editor === "select" || target.dataset.commitOnChange === "true") {
                if (this.commitActiveEdit()) {
                    this.getScrollContainer()?.focus({ preventScroll: true });
                }
                else {
                    this.refocusActiveEditor();
                }
            }
            return;
        }
    }
    handleGridPaste(event) {
        if (this.focusMode !== "cell" ||
            this.isEditorEvent(event) ||
            this.isEditorElement(event.target)) {
            return;
        }
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const detail = this.pasteDetailForText(text);
        if (!detail) {
            return;
        }
        event.preventDefault();
        this.$emit("cell-paste", detail);
    }
    handleGridFocusOut(event) {
        const target = event.target;
        if (!this.isEditorElement(target)) {
            return;
        }
        const sessionId = this.#editingSession?.id ?? null;
        const relatedTarget = event.relatedTarget;
        if (this.isTargetWithinEditingOwnership(relatedTarget)) {
            return;
        }
        // A concrete outside target is an intentional focus transfer. Resolve it
        // before a pending row refresh can mistake the departure for DOM recycling.
        if (relatedTarget) {
            if (!this.commitActiveEdit()) {
                this.refocusActiveEditor();
            }
            return;
        }
        if (sessionId && this.#presentationRetainingSessionId === sessionId) {
            this.captureEditorSelection(target, sessionId);
            this.scheduleEditorRestore(sessionId, true);
            return;
        }
        requestAnimationFrame(() => {
            if (!this.editingCell || !sessionId || this.#editingSession?.id !== sessionId) {
                return;
            }
            const currentEditor = this.getActiveEditorElement();
            if (currentEditor && currentEditor !== target) {
                seedEditorValue(currentEditor, this.editingValue);
                this.restoreEditorSelection(currentEditor, sessionId);
                return;
            }
            if (this.#presentationRetainingSessionId === sessionId &&
                currentEditor !== target &&
                this.presentedCellAt(this.#editingSession.location)?.editable) {
                this.captureEditorSelection(target, sessionId);
                this.scheduleEditorRestore(sessionId, true);
                return;
            }
            if (currentEditor?.matches?.(":focus-within")) {
                return;
            }
            const editorShadowActiveElement = currentEditor?.shadowRoot?.activeElement;
            if (editorShadowActiveElement) {
                return;
            }
            const activeElement = this.shadowRoot?.activeElement;
            if (activeElement && this.isEditorElement(activeElement)) {
                return;
            }
            if (!this.commitActiveEdit()) {
                this.refocusActiveEditor();
            }
        });
    }
    async handleCopyRequest() {
        const detail = this.copyDetailForCurrentSelection();
        if (!detail) {
            return;
        }
        this.$emit("cell-copy", detail);
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) {
            return;
        }
        try {
            await clipboard.writeText(detail.text);
        }
        catch {
            // Ignore clipboard permission failures; the event still exposes copy intent.
        }
    }
    handleSortRequest(columnId) {
        if (this.editingCell && !this.commitActiveEdit()) {
            this.refocusActiveEditor();
            return;
        }
        const currentDirection = this.sort?.columnId === columnId ? this.sort.direction : null;
        let nextSort;
        if (currentDirection === null) {
            nextSort = { columnId, direction: "ascending" };
        }
        else if (currentDirection === "ascending") {
            nextSort = { columnId, direction: "descending" };
        }
        else {
            nextSort = null;
        }
        this.sort = nextSort;
        this.$emit("sort-change", nextSort);
    }
    handleColumnResizePointerDown(columnId, event) {
        const session = startColumnResizeSession({
            button: event.button,
            pointerId: event.pointerId,
            columnId,
            clientX: event.clientX,
            startWidth: this.renderedColumnWidth(columnId),
        });
        if (!session) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        this.#columnResizeSession = session;
        this.#columnResizeHandle = handle;
        try {
            handle?.setPointerCapture(event.pointerId);
        }
        catch {
            // Ignore capture failures for synthetic Storybook pointer events.
        }
    }
    handleColumnResizePointerMove(event) {
        const session = this.#columnResizeSession;
        if (!isColumnResizeEventForSession(session, event.pointerId) || !session.columnId) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const width = computeResizedColumnWidth({
            session,
            clientX: event.clientX,
            minimumWidth: this.minimumColumnWidth(session.columnId),
        });
        this.applyLiveColumnWidth(session.columnId, `${width}px`);
    }
    handleColumnResizePointerUp(event) {
        const session = this.#columnResizeSession;
        if (!isColumnResizeEventForSession(session, event.pointerId) || !session.columnId) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const width = computeResizedColumnWidth({
            session,
            clientX: event.clientX,
            minimumWidth: this.minimumColumnWidth(session.columnId),
        });
        this.commitColumnWidth(session.columnId, `${width}px`);
        this.endColumnResize();
    }
    handleColumnResizePointerCancel(event) {
        const session = this.#columnResizeSession;
        if (!isColumnResizeEventForSession(session, event.pointerId) || !session.columnId) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.applyLiveColumnWidth(session.columnId, this.resolvedColumnWidth(session.columnId));
        this.endColumnResize();
    }
    handleColumnResizeDoubleClick(columnId, event) {
        event.preventDefault();
        event.stopPropagation();
        const width = `${this.autosizedColumnWidth(columnId)}px`;
        this.applyLiveColumnWidth(columnId, width);
        this.commitColumnWidth(columnId, width);
    }
    handleToggleAll(event) {
        const input = event.currentTarget;
        const nextSelected = input?.checked ? this.presentedRows.map((row) => row.id) : [];
        this.updateSelection(nextSelected);
    }
    handleRowSelection(rowId, event) {
        if (this.selectionMode === "none") {
            return;
        }
        const input = event.currentTarget;
        const checked = Boolean(input?.checked);
        if (this.selectionMode === "single") {
            this.updateSelection(checked ? [rowId] : []);
            return;
        }
        const current = new Set(this.selectedRowIds);
        if (checked) {
            current.add(rowId);
        }
        else {
            current.delete(rowId);
        }
        this.updateSelection([...current]);
    }
    handleCellPointerActivate(rowId, columnId, extendRange = false) {
        if (this.focusMode !== "cell") {
            return;
        }
        this.editAnnouncement = "";
        this.setActiveCell({ rowId, columnId }, { extendRange });
        this.getScrollContainer()?.focus({ preventScroll: true });
    }
    updateSelection(nextSelectedRowIds) {
        const uniqueSelected = [...new Set(nextSelectedRowIds)];
        this.selectedRowIds = uniqueSelected;
        this.$emit("selection-change", { selectedRowIds: uniqueSelected });
    }
    clearRangeSelectionState() {
        if (this.selectedRowIds.length) {
            this.selectedRowIds = [];
        }
        if (this.cellSelection) {
            this.cellSelection = null;
        }
        if (this.fillPreview) {
            this.fillPreview = null;
        }
    }
    commitColumnWidth(columnId, width) {
        const nextWidths = {
            ...(this.columnWidths ?? {}),
            [columnId]: width,
        };
        this.columnWidths = nextWidths;
        this.$emit("column-width-change", {
            columnId,
            width,
            columnWidths: nextWidths,
        });
    }
    endColumnResize() {
        if (this.#columnResizeHandle &&
            this.#columnResizeSession.pointerId !== null &&
            this.#columnResizeHandle.hasPointerCapture?.(this.#columnResizeSession.pointerId)) {
            try {
                this.#columnResizeHandle.releasePointerCapture(this.#columnResizeSession.pointerId);
            }
            catch {
                // Ignore release failures for synthetic Storybook pointer events.
            }
        }
        this.#columnResizeSession = clearedColumnResizeSession();
        this.#columnResizeHandle = null;
    }
    schedulePresentationRefresh() {
        if (!this.$fastController.isConnected) {
            return;
        }
        this.refreshPresentation();
    }
    refreshPresentation() {
        this.#presentationRevision += 1;
        const sourceColumns = this.columns ?? [];
        const sourceRows = this.rows ?? [];
        const sourceSelectedRowIds = this.selectedRowIds ?? [];
        const presentedColumns = sourceColumns.map((column) => this.createPresentedColumn(column));
        const sortedRows = this.sortRows(sourceRows, presentedColumns);
        const validSelectedIds = new Set(sortedRows.map((row) => row.id));
        const sourceRowsById = new Map(sourceRows.map((row) => [row.id, row]));
        const prunedSelection = sourceSelectedRowIds.filter((id) => validSelectedIds.has(id));
        if (prunedSelection.length !== sourceSelectedRowIds.length) {
            this.selectedRowIds = prunedSelection;
        }
        this.presentedColumns = presentedColumns;
        this.#columnIndexById = new Map(presentedColumns.map((column, index) => [column.id, index]));
        this.#rowIndexById = new Map(sortedRows.map((row, index) => [row.id, index]));
        this.#selectedRowIdSet = new Set(prunedSelection);
        this.presentedRows = sortedRows.map((row) => this.createPresentedRow(row, presentedColumns));
        for (const [rowId, cached] of this.#rowPresentationCache) {
            if (!validSelectedIds.has(rowId) || sourceRowsById.get(rowId) !== cached.source) {
                this.#rowPresentationCache.delete(rowId);
            }
        }
        for (const [rowId, cached] of this.#sortKeyCache) {
            if (!validSelectedIds.has(rowId) || sourceRowsById.get(rowId) !== cached.source) {
                this.#sortKeyCache.delete(rowId);
            }
        }
        this.syncActiveCell();
        this.syncCellSelection();
        this.syncEditingCell();
        this.syncFillPreview();
        this.updateInteractionState();
        this.syncRenderedRows();
        this.scheduleVirtualizerUpdate();
        this.syncHostStates();
    }
    createPresentedColumn(column) {
        return buildPresentedColumn(column, {
            resolvedWidth: this.columnWidths?.[column.id] ?? column.width,
            mergePartNames: (base, extra) => this.mergePartNames(base, extra),
        });
    }
    createPresentedRow(row, columns) {
        const cached = this.#rowPresentationCache.get(row.id);
        if (cached?.source === row && cached.columnRevision === this.#columnRevision) {
            return cached.row;
        }
        const rowLabel = row.label?.trim() || row.id;
        let materializedCells = null;
        const presentedRow = {
            id: row.id,
            label: rowLabel,
            data: row.data,
        };
        const baseCells = () => {
            if (!materializedCells) {
                materializedCells = buildPresentedRow(row, columns, {
                    cellValueFor: (rowValue, column) => this.cellValueFor(rowValue, column),
                    serializeCellValue: (column, rowData, rawValue) => this.serializeCellValue(column, rowData, rawValue),
                    cellIdFor: (rowId, columnId) => this.cellIdFor(rowId, columnId),
                    editingErrorIdFor: (rowId, columnId) => this.cellEditorErrorIdFor(rowId, columnId),
                    editorOptionsForColumn: (column, rowData) => this.editorOptionsForColumn(column, rowData),
                }).cells;
            }
            return materializedCells;
        };
        this.#baseCellsByPresentedRow.set(presentedRow, baseCells);
        Object.defineProperty(presentedRow, "cells", {
            configurable: false,
            enumerable: true,
            get: () => {
                const cells = baseCells();
                if (this.focusMode !== "cell") {
                    return cells;
                }
                const rowIndex = this.#rowIndexById.get(row.id);
                if (rowIndex === undefined) {
                    return cells;
                }
                return this.withInteractionState(presentedRow, rowIndex, this.interactionSnapshot()).cells;
            },
        });
        this.#rowPresentationCache.set(row.id, {
            source: row,
            columnRevision: this.#columnRevision,
            row: presentedRow,
        });
        return presentedRow;
    }
    updateInteractionState() {
        this.#interactionRevision += 1;
        this.syncRenderedRows();
    }
    withInteractionState(row, rowIndex, snapshot) {
        if (this.focusMode !== "cell") {
            return row;
        }
        const cached = this.#decoratedRowCache.get(row.id);
        if (cached?.source === row && cached.interactionRevision === this.#interactionRevision) {
            return cached.row;
        }
        const baseCells = this.#baseCellsByPresentedRow.get(row)?.() ?? row.cells;
        const decoratedRow = {
            id: row.id,
            label: row.label,
            data: row.data,
            cells: baseCells.map((cell, columnIndex) => {
                const indices = { rowIndex, columnIndex };
                const selected = computeIsCellSelected(snapshot.selectionBounds, indices);
                const rangeEdge = computeRangeEdgeForCell(snapshot.selectionBounds, indices);
                const fillPreview = computeIsFillPreviewCell(snapshot.fillPreviewBounds, snapshot.fillSourceBounds, indices);
                const active = this.isActiveCell(cell.rowId, cell.columnId);
                const editing = this.isEditingCell(cell.rowId, cell.columnId);
                return {
                    ...cell,
                    active,
                    selected,
                    fillPreview,
                    rangeEdge,
                    editing,
                    editValue: editing ? this.editingValue : "",
                    editingError: editing ? this.editingError : "",
                    resolvedCellPartText: composeCellPartText(cell.cellPartText, {
                        selected,
                        rangeEdge,
                        fillPreview,
                        active,
                        editing,
                    }),
                };
            }),
        };
        this.#decoratedRowCache.set(row.id, {
            source: row,
            interactionRevision: this.#interactionRevision,
            row: decoratedRow,
        });
        return decoratedRow;
    }
    resolvedColumnWidth(columnId) {
        return resolveGridColumnWidth(columnId, this.columnWidths, this.columns);
    }
    renderedColumnWidth(columnId) {
        const headerCell = this.headerCellElement(columnId);
        return computeRenderedColumnWidth({
            headerCell,
            resolvedWidth: this.resolvedColumnWidth(columnId),
        });
    }
    minimumColumnWidth(columnId) {
        const headerCell = this.headerCellElement(columnId);
        return computeMinimumColumnWidth(headerCell);
    }
    applyLiveColumnWidth(columnId, width) {
        const value = width ?? "";
        const rowId = CSS.escape(columnId);
        this.shadowRoot?.querySelectorAll(`[data-column-id="${rowId}"]`).forEach((element) => {
            const style = element.style;
            style.width = value;
            style.inlineSize = value;
            style.minInlineSize = value;
            style.maxInlineSize = value;
        });
    }
    headerCellElement(columnId) {
        const escaped = CSS.escape(columnId);
        return this.shadowRoot?.querySelector(`th[data-column-id="${escaped}"]`);
    }
    autosizedColumnWidth(columnId) {
        const columnIndex = this.#columnIndexById.get(columnId);
        const column = columnIndex === undefined ? undefined : this.presentedColumns[columnIndex];
        const headerCell = this.headerCellElement(columnId);
        const sampleCell = this.cellElementForLocation(this.presentedRows[0] ? { rowId: this.presentedRows[0].id, columnId } : null);
        const canvas = this.#measurementCanvas ?? (this.#measurementCanvas = document.createElement("canvas"));
        return computeAutosizedColumnWidth({
            columnId,
            column: column ?? null,
            rows: this.presentedRows,
            headerCell,
            sampleCell,
            getCellText: (location) => this.cellTextAt(location),
            sampleRows: sampleAutosizeRows(this.presentedRows),
            measurementCanvas: canvas,
        });
    }
    cellValueFor(row, column) {
        return resolveCellValue(row, column.source);
    }
    editorOptionsForColumn(column, rowData) {
        return resolveEditorOptionsForColumn(column, rowData);
    }
    serializeCellValue(column, rowData, rawValue) {
        return serializeGridCellValue({
            column,
            rowData,
            rawValue,
            booleanCellValue: (value) => this.booleanCellValue(value),
        });
    }
    sortRows(rows, columns) {
        return sortGridRows({
            rows,
            columns: columns.map((column) => column.source),
            sort: this.sort,
            sortMode: this.sortMode,
            getSortKey: (row, column) => this.sortKeyFor(row, column),
        });
    }
    sortKeyFor(row, column) {
        const cached = this.#sortKeyCache.get(row.id);
        if (cached?.source === row && cached.column === column) {
            return cached.key;
        }
        const key = stringifyCellValue(resolveCellValue(row, column));
        this.#sortKeyCache.set(row.id, {
            source: row,
            column: column,
            key,
        });
        return key;
    }
    syncActiveCell() {
        this.activeCell = syncPresentedActiveCell({
            focusMode: this.focusMode,
            rows: this.presentedRows,
            columns: this.presentedColumns,
            activeCell: this.activeCell,
        });
    }
    syncCellSelection() {
        this.cellSelection = syncPresentedCellSelection({
            focusMode: this.focusMode,
            activeCell: this.activeCell,
            cellSelection: this.cellSelection,
            isValidLocation: (location) => this.isValidCellLocation(location),
        });
    }
    syncFillPreview() {
        this.fillPreview = syncPresentedFillPreview({
            focusMode: this.focusMode,
            fillPreview: this.fillPreview,
            isValidLocation: (location) => this.isValidCellLocation(location),
        });
    }
    syncEditingCell() {
        const nextState = syncEditingState({
            focusMode: this.focusMode,
            editingCell: this.editingCell,
            editingValue: this.editingValue,
            isEditableLocation: (location) => Boolean(this.presentedCellAt(location)?.editable),
        });
        if (this.editingCell && !nextState.editingCell) {
            this.cancelActiveEdit();
            return;
        }
        this.editingCell = nextState.editingCell;
        this.editingValue = nextState.editingValue;
        if (this.#editingSession) {
            this.scheduleEditorRestore(this.#editingSession.id);
        }
    }
    firstCellLocation() {
        return resolveNavigationFirstCellLocation(this.presentedRows, this.presentedColumns);
    }
    nextCellLocationForKey(event) {
        return resolveNextCellLocationForKey({
            rows: this.presentedRows,
            columns: this.presentedColumns,
            activeCell: this.activeCell,
            key: event.key,
            metaKey: event.ctrlKey || event.metaKey,
        });
    }
    setActiveCell(location, options = {}) {
        const extendRange = options.extendRange ?? false;
        if (!this.sameEditingLocation(this.activeCell, location)) {
            this.editAnnouncement = "";
        }
        if (extendRange) {
            const anchor = this.cellSelection?.anchor ?? this.activeCell ?? location;
            this.cellSelection = this.createCellSelection(anchor, location);
        }
        else if (this.cellSelection) {
            this.cellSelection = null;
        }
        this.activeCell = location;
        this.updateInteractionState();
    }
    startEditingCell(location) {
        if (this.editingCell) {
            if (this.sameEditingLocation(this.editingCell, location)) {
                this.refocusActiveEditor();
                return;
            }
            if (!this.commitActiveEdit()) {
                this.refocusActiveEditor();
                return;
            }
        }
        const cell = this.presentedCellAt(location);
        const nextState = beginEditingState(location, cell, cell ? this.editStringForCell(cell) : "");
        if (!nextState) {
            return;
        }
        this.cellSelection = null;
        this.editAnnouncement = "";
        this.editingError = "";
        this.#editingSession = {
            id: ++this.#nextEditingSessionId,
            location: { ...location },
        };
        this.editingValue = nextState.editingValue;
        this.editingCell = nextState.editingCell;
        this.$emit("edit-start", location);
    }
    opensOnSingleActiveClick(editor) {
        return editorOpensOnSingleActiveClick(editor);
    }
    /**
     * Commit the active edit synchronously.
     *
     * Returns true only when one session resolves. False means either there
     * was no edit or validation retained the same session; inspect
     * `editingCell` before and after when the distinction matters.
     */
    commitActiveEdit() {
        const session = this.currentEditingSession();
        if (!session || this.#resolvingEditingSessionId === session.id) {
            return false;
        }
        const cell = this.presentedCellAt(session.location);
        if (!cell?.editable || cell.editor === "checkbox") {
            return this.cancelActiveEdit();
        }
        const editor = this.getActiveEditorElement();
        if (editor) {
            this.editingValue = this.editorValueFromTarget(editor);
        }
        this.#resolvingEditingSessionId = session.id;
        const resolution = resolveEditingValue(cell, this.editingValue);
        this.#resolvingEditingSessionId = null;
        if (this.#editingSession?.id !== session.id) {
            return false;
        }
        if (!resolution.valid) {
            this.editingError = resolution.message;
            this.updateInteractionState();
            this.scheduleEditorRestore(session.id);
            return false;
        }
        const detail = {
            rowId: session.location.rowId,
            columnId: session.location.columnId,
            value: resolution.value,
        };
        this.clearEditingSession(session.id);
        this.$emit("cell-change", detail);
        return true;
    }
    commitEditingCell() {
        return this.commitActiveEdit();
    }
    commitEditingCellAndMove(direction) {
        const currentCell = this.editingCell;
        if (!currentCell) {
            return;
        }
        if (!this.commitActiveEdit()) {
            this.refocusActiveEditor();
            return;
        }
        const nextCell = this.nextTabCellLocation(currentCell, direction);
        this.setActiveCell(nextCell ?? currentCell);
        this.getScrollContainer()?.focus({ preventScroll: true });
    }
    /** Cancel the active edit synchronously and emit `edit-cancel` once. */
    cancelActiveEdit() {
        const session = this.currentEditingSession();
        if (!session) {
            return false;
        }
        const result = clearEditingState(session.location);
        this.clearEditingSession(session.id);
        this.$emit("edit-cancel", result.cancelledCell);
        return true;
    }
    cancelEditingCell() {
        return this.cancelActiveEdit();
    }
    currentEditingSession() {
        if (!this.editingCell) {
            return null;
        }
        if (this.sameEditingLocation(this.#editingSession?.location, this.editingCell)) {
            return this.#editingSession;
        }
        this.#editingSession = {
            id: ++this.#nextEditingSessionId,
            location: { ...this.editingCell },
        };
        return this.#editingSession;
    }
    clearEditingSession(sessionId) {
        if (this.#editingSession?.id !== sessionId) {
            return;
        }
        this.#editingSession = null;
        this.#editingEditorElement = null;
        this.#pendingEditorSelection = null;
        this.#presentationRetainingSessionId = null;
        this.#resolvingEditingSessionId = null;
        this.editingCell = null;
        this.editingValue = "";
        this.editingError = "";
    }
    sameEditingLocation(left, right) {
        return Boolean(left && right && left.rowId === right.rowId && left.columnId === right.columnId);
    }
    cancelEditIfSourceTargetInvalidated() {
        const location = this.editingCell;
        if (!location) {
            return;
        }
        const rowExists = (this.rows ?? []).some((row) => row.id === location.rowId);
        const column = (this.columns ?? []).find((column) => column.id === location.columnId);
        if (!rowExists || !column?.editable || column.editor === "checkbox") {
            this.cancelActiveEdit();
        }
    }
    scheduleEditorRestore(sessionId, forceFocus = false, attempt = 0) {
        if (!sessionId) {
            return;
        }
        if (this.#editorRestoreFrame !== null) {
            cancelAnimationFrame(this.#editorRestoreFrame);
        }
        this.#editorRestoreFrame = requestAnimationFrame(() => {
            this.#editorRestoreFrame = null;
            if (this.#editingSession?.id !== sessionId) {
                return;
            }
            const editor = this.getActiveEditorElement();
            if (!editor) {
                if (this.#presentationRetainingSessionId === sessionId && attempt < 3) {
                    this.scheduleEditorRestore(sessionId, forceFocus, attempt + 1);
                    return;
                }
                if (this.#presentationRetainingSessionId === sessionId) {
                    this.cancelActiveEdit();
                }
                return;
            }
            if (editor === this.#editingEditorElement) {
                // FAST may move the same editor node while rebinding rows. Firefox
                // and WebKit drop focus on that move without replacing the element.
                if (forceFocus || this.#presentationRetainingSessionId === sessionId) {
                    editor?.focus?.({ preventScroll: true });
                }
                if (this.#presentationRetainingSessionId === sessionId && attempt < 3) {
                    this.scheduleEditorRestore(sessionId, forceFocus, attempt + 1);
                    return;
                }
                this.#presentationRetainingSessionId = null;
                return;
            }
            seedEditorValue(editor, this.editingValue);
            this.restoreEditorSelection(editor, sessionId);
            this.#editingEditorElement = editor;
            if (this.#presentationRetainingSessionId === sessionId && attempt < 3) {
                this.scheduleEditorRestore(sessionId, true, attempt + 1);
                return;
            }
            this.#presentationRetainingSessionId = null;
        });
    }
    captureActiveEditorSelection() {
        const sessionId = this.#editingSession?.id;
        const editor = this.getActiveEditorElement();
        if (sessionId && editor) {
            this.captureEditorSelection(editor, sessionId);
        }
    }
    captureEditorSelection(editor, sessionId) {
        if (editor.selectionStart === null || editor.selectionStart === undefined) {
            return;
        }
        this.#pendingEditorSelection = {
            sessionId,
            start: editor.selectionStart,
            end: editor.selectionEnd ?? editor.selectionStart,
            direction: editor.selectionDirection ?? undefined,
        };
    }
    restoreEditorSelection(editor, sessionId) {
        if (!editor) {
            return;
        }
        const selection = this.#pendingEditorSelection;
        editor.focus?.({ preventScroll: true });
        if (selection?.sessionId === sessionId && editor.setSelectionRange) {
            editor.setSelectionRange(selection.start, selection.end, selection.direction);
            this.#pendingEditorSelection = null;
            return;
        }
        focusEditorAtEnd(editor);
    }
    refocusActiveEditor() {
        this.scheduleEditorRestore(this.#editingSession?.id ?? null, true);
    }
    isTargetWithinEditingOwnership(target) {
        const editor = this.getActiveEditorElement();
        if (!editor || !(target instanceof Node)) {
            return false;
        }
        if (editor.contains(target) || editor.shadowRoot?.contains(target)) {
            return true;
        }
        const element = target instanceof HTMLElement ? target : target.parentElement;
        const widget = element?.closest("[data-cell-widget]") ?? null;
        if (!widget) {
            return false;
        }
        const cell = widget.closest("td[data-row-id][data-column-id]");
        return Boolean(cell &&
            this.editingCell &&
            cell.dataset.rowId === this.editingCell.rowId &&
            cell.dataset.columnId === this.editingCell.columnId);
    }
    ensureActiveCellVisible() {
        if (!this.activeCell) {
            return;
        }
        const rowIndex = this.#rowIndexById.get(this.activeCell.rowId);
        if (rowIndex === undefined) {
            return;
        }
        if (this.virtualize) {
            this.#rowVirtualizer.scrollToIndex(rowIndex, { align: "auto" });
        }
        requestAnimationFrame(() => {
            const activeCell = this.getActiveCellElement();
            const scrollContainer = this.getScrollContainer();
            if (!activeCell || !scrollContainer) {
                return;
            }
            const cellRect = activeCell.getBoundingClientRect();
            const scrollRect = scrollContainer.getBoundingClientRect();
            if (cellRect.left < scrollRect.left) {
                scrollContainer.scrollLeft += cellRect.left - scrollRect.left;
            }
            else if (cellRect.right > scrollRect.right) {
                scrollContainer.scrollLeft += cellRect.right - scrollRect.right;
            }
            if (!this.virtualize) {
                if (cellRect.top < scrollRect.top) {
                    scrollContainer.scrollTop += cellRect.top - scrollRect.top;
                }
                else if (cellRect.bottom > scrollRect.bottom) {
                    scrollContainer.scrollTop += cellRect.bottom - scrollRect.bottom;
                }
            }
        });
    }
    cellTextAt(location) {
        return this.presentedCellAt(location)?.text ?? "";
    }
    createCellSelection(anchor, focus) {
        return createNavigationCellSelection(anchor, focus);
    }
    isValidCellLocation(location) {
        return Boolean(location &&
            this.#rowIndexById.has(location.rowId) &&
            this.#columnIndexById.has(location.columnId));
    }
    normalizedCellSelection() {
        return this.boundsForRange(this.cellSelection);
    }
    visualSelectionBounds() {
        return this.fillPreview
            ? this.boundsForRange(this.fillPreview)
            : this.normalizedCellSelection();
    }
    selectedCellLocations() {
        return selectedLocations(this.presentedRows, this.presentedColumns, this.normalizedCellSelection(), this.activeCell);
    }
    copyTextForLocations(locations) {
        return copyTextForSelection({
            selection: this.normalizedCellSelection(),
            locations,
            rows: this.presentedRows,
            columns: this.presentedColumns,
            getCellText: (location) => this.cellTextAt(location),
        });
    }
    copyDetailForCurrentSelection() {
        const cells = this.selectedCellLocations();
        if (!cells.length) {
            return null;
        }
        return {
            cells,
            text: this.copyTextForLocations(cells),
        };
    }
    pasteDetailForText(text) {
        const normalizedText = this.normalizePastedText(text);
        if (!normalizedText) {
            return null;
        }
        const origin = this.pasteOriginLocation();
        if (!origin) {
            return null;
        }
        const changes = this.pasteChangesForText(origin, normalizedText);
        if (!changes.length) {
            return null;
        }
        return {
            origin,
            text: normalizedText,
            changes,
        };
    }
    normalizePastedText(text) {
        return normalizeGridPastedText(text);
    }
    pasteOriginLocation() {
        return resolvePasteOriginLocation({
            selection: this.normalizedCellSelection(),
            rows: this.presentedRows,
            columns: this.presentedColumns,
            activeCell: this.activeCell,
        });
    }
    pasteChangesForText(origin, text) {
        const originIndices = this.cellIndicesFor(origin);
        if (!originIndices) {
            return [];
        }
        return buildPasteChanges({
            text,
            originIndices,
            selection: this.normalizedCellSelection(),
            selectedLocations: this.selectedCellLocations(),
            rows: this.presentedRows,
            columns: this.presentedColumns,
            normalizeValue: (cell, value) => this.normalizedEditingValue(cell, value),
        });
    }
    currentFillSourceRange() {
        const selection = this.normalizedCellSelection();
        if (selection) {
            return this.rangeFromBounds(selection);
        }
        return this.activeCell ? { anchor: this.activeCell, focus: this.activeCell } : null;
    }
    hasEditableCellsInRange(range) {
        return hasEditableCellsInBounds(this.presentedRows, this.boundsForRange(range));
    }
    shouldShowFillHandleForCell(rowId, columnId) {
        if (this.focusMode !== "cell") {
            return false;
        }
        const range = this.currentFillSourceRange();
        if (!range) {
            return false;
        }
        const bounds = this.visualSelectionBounds() ?? this.boundsForRange(range);
        const location = bounds ? this.locationForIndices(bounds.rowEnd, bounds.columnEnd) : null;
        if (!location || location.rowId !== rowId || location.columnId !== columnId) {
            return false;
        }
        return this.hasEditableCellsInRange(range);
    }
    currentFillSourceBounds() {
        return this.currentFillSourceRange()
            ? this.boundsForRange(this.currentFillSourceRange())
            : null;
    }
    boundsForRange(range) {
        if (!range) {
            return null;
        }
        const anchor = this.cellIndicesFor(range.anchor);
        const focus = this.cellIndicesFor(range.focus);
        if (!anchor || !focus) {
            return null;
        }
        return {
            rowStart: Math.min(anchor.rowIndex, focus.rowIndex),
            rowEnd: Math.max(anchor.rowIndex, focus.rowIndex),
            columnStart: Math.min(anchor.columnIndex, focus.columnIndex),
            columnEnd: Math.max(anchor.columnIndex, focus.columnIndex),
        };
    }
    rangeFromBounds(bounds) {
        return selectionRangeFromBounds(this.presentedRows, this.presentedColumns, bounds);
    }
    locationForIndices(rowIndex, columnIndex) {
        return selectionLocationForIndices(this.presentedRows, this.presentedColumns, rowIndex, columnIndex);
    }
    beginFillDrag(event) {
        const sourceRange = this.currentFillSourceRange();
        if (!sourceRange || !this.hasEditableCellsInRange(sourceRange)) {
            return;
        }
        const session = startFillDragSession(event.pointerId, sourceRange);
        if (!session) {
            return;
        }
        const scrollContainer = this.getScrollContainer();
        this.#fillSession = session;
        this.fillPreview = null;
        scrollContainer?.focus({ preventScroll: true });
        try {
            scrollContainer?.setPointerCapture(event.pointerId);
        }
        catch {
            // Synthetic Storybook pointer events do not always create a capturable pointer.
        }
        event.preventDefault();
    }
    handleFillPointerMove(event) {
        const sourceRange = this.#fillSession.sourceRange;
        if (!sourceRange) {
            return;
        }
        const sourceBounds = this.boundsForRange(sourceRange);
        const location = this.fillTargetLocationForPoint(event.clientX, event.clientY, sourceBounds);
        this.fillPreview = location ? this.fillPreviewRangeForLocation(location, sourceRange) : null;
    }
    handleFillPointerUp() {
        const detail = this.fillDetailForPreview();
        const previewRange = detail?.target ?? this.fillPreview;
        if (detail) {
            this.$emit("cell-fill", detail);
        }
        this.endFillDrag(true);
        if (!previewRange) {
            return;
        }
        this.cellSelection = this.createCellSelection(previewRange.anchor, previewRange.focus);
    }
    endFillDrag(suppressNextClick) {
        const scrollContainer = this.getScrollContainer();
        if (scrollContainer &&
            this.#fillSession.pointerId !== null &&
            scrollContainer.hasPointerCapture?.(this.#fillSession.pointerId)) {
            try {
                scrollContainer.releasePointerCapture(this.#fillSession.pointerId);
            }
            catch {
                // Ignore release failures for synthetic pointer events.
            }
        }
        this.#suppressNextGridClick = suppressNextClick;
        this.#fillSession = clearedFillSession();
        this.fillPreview = null;
    }
    fillPreviewRangeForLocation(location, sourceRange) {
        const sourceBounds = this.boundsForRange(sourceRange);
        const targetIndices = this.cellIndicesFor(location);
        if (!sourceBounds || !targetIndices) {
            return null;
        }
        const expandedBounds = {
            rowStart: Math.min(sourceBounds.rowStart, targetIndices.rowIndex),
            rowEnd: Math.max(sourceBounds.rowEnd, targetIndices.rowIndex),
            columnStart: Math.min(sourceBounds.columnStart, targetIndices.columnIndex),
            columnEnd: Math.max(sourceBounds.columnEnd, targetIndices.columnIndex),
        };
        const clampedBounds = this.clampFillBoundsToEditableTargets(expandedBounds, sourceBounds);
        if (clampedBounds.rowStart === sourceBounds.rowStart &&
            clampedBounds.rowEnd === sourceBounds.rowEnd &&
            clampedBounds.columnStart === sourceBounds.columnStart &&
            clampedBounds.columnEnd === sourceBounds.columnEnd) {
            return null;
        }
        return this.rangeFromBounds(clampedBounds);
    }
    clampFillBoundsToEditableTargets(expandedBounds, sourceBounds) {
        return clampEditableFillBounds(this.presentedRows, expandedBounds, sourceBounds);
    }
    fillTargetLocationForPoint(clientX, clientY, sourceBounds) {
        const direct = this.locationFromPointerEventLike(clientX, clientY);
        if (direct && (!sourceBounds || !this.locationWithinBounds(direct, sourceBounds))) {
            return direct;
        }
        const preferredAxis = sourceBounds
            ? this.fillPreferredAxisForPoint(clientX, clientY, sourceBounds)
            : null;
        if (preferredAxis) {
            const axisAlignedLocation = this.nearestLocationForPoint(clientX, clientY, (location) => {
                if (sourceBounds && this.locationWithinBounds(location, sourceBounds)) {
                    return false;
                }
                const indices = this.cellIndicesFor(location);
                if (!indices || !sourceBounds) {
                    return true;
                }
                if (preferredAxis === "horizontal") {
                    return (indices.rowIndex >= sourceBounds.rowStart && indices.rowIndex <= sourceBounds.rowEnd);
                }
                return (indices.columnIndex >= sourceBounds.columnStart &&
                    indices.columnIndex <= sourceBounds.columnEnd);
            });
            if (axisAlignedLocation) {
                return axisAlignedLocation;
            }
        }
        return this.nearestLocationForPoint(clientX, clientY, (location) => sourceBounds ? !this.locationWithinBounds(location, sourceBounds) : true);
    }
    fillPreferredAxisForPoint(clientX, clientY, sourceBounds) {
        return preferredAxisForPoint(clientX, clientY, this.rectForBounds(sourceBounds));
    }
    rectForBounds(bounds) {
        const start = this.locationForIndices(bounds.rowStart, bounds.columnStart);
        const end = this.locationForIndices(bounds.rowEnd, bounds.columnEnd);
        const startCell = this.cellElementForLocation(start);
        const endCell = this.cellElementForLocation(end);
        return rectFromCellPair(startCell, endCell);
    }
    fillDetailForPreview() {
        const source = this.#fillSession.sourceRange;
        const target = this.fillPreview;
        if (!source || !target) {
            return null;
        }
        const sourceBounds = this.boundsForRange(source);
        const targetBounds = this.boundsForRange(target);
        if (!sourceBounds || !targetBounds) {
            return null;
        }
        const changes = buildFillChanges({
            rows: this.presentedRows,
            columns: this.presentedColumns,
            sourceBounds,
            targetBounds,
            normalizeValue: (cell, value) => this.normalizedEditingValue(cell, value),
        });
        if (!changes.length) {
            return null;
        }
        return {
            source,
            target,
            changes,
        };
    }
    presentedCellAt(location) {
        if (!location) {
            return null;
        }
        const rowIndex = this.#rowIndexById.get(location.rowId);
        const columnIndex = this.#columnIndexById.get(location.columnId);
        if (rowIndex === undefined || columnIndex === undefined) {
            return null;
        }
        return this.presentedRows[rowIndex]?.cells[columnIndex] ?? null;
    }
    editStringForCell(cell) {
        return editStringForRawValue(cell.rawValue);
    }
    normalizedEditingValue(cell, value) {
        return normalizeEditingValue(cell, value);
    }
    booleanCellValue(value) {
        return normalizeBooleanCellValue(value);
    }
    nextTabCellLocation(current, direction) {
        return nextTabLocation(this.presentedRows, this.presentedColumns, current, direction);
    }
    cellIndicesFor(location) {
        const rowIndex = this.#rowIndexById.get(location.rowId);
        const columnIndex = this.#columnIndexById.get(location.columnId);
        return rowIndex === undefined || columnIndex === undefined ? null : { rowIndex, columnIndex };
    }
    isEditingCell(rowId, columnId) {
        return this.editingCell?.rowId === rowId && this.editingCell?.columnId === columnId;
    }
    isEditorElement(target) {
        return isGridEditorElement(target);
    }
    editorValueFromTarget(target) {
        return editorStringValue(target);
    }
    isInteractiveCellWidgetTarget(target) {
        return isGridInteractiveCellWidgetTarget(target);
    }
    isCheckboxCellTarget(target) {
        return isGridCheckboxCellTarget(target);
    }
    commitCheckboxCellToggle(location, checked) {
        const cell = this.presentedCellAt(location);
        if (!cell?.editable || cell.editor !== "checkbox") {
            return;
        }
        this.$emit("cell-change", {
            rowId: location.rowId,
            columnId: location.columnId,
            value: this.normalizedEditingValue(cell, checked),
        });
    }
    isFillHandleTarget(target) {
        return isGridFillHandleTarget(target);
    }
    closestFromEventPath(event, selector) {
        return eventClosestFromEventPath(event, selector);
    }
    isEditorEvent(event) {
        return this.closestFromEventPath(event, ".cell-editor") !== null;
    }
    isInteractiveCellWidgetEvent(event) {
        return event.composedPath().some((target) => isGridInteractiveCellWidgetTarget(target));
    }
    isCheckboxCellEvent(event) {
        return this.closestFromEventPath(event, '[data-cell-widget="checkbox"]') !== null;
    }
    isFillHandleEvent(event) {
        return this.closestFromEventPath(event, '[data-fill-handle="true"]') !== null;
    }
    isActiveCell(rowId, columnId) {
        return this.activeCell?.rowId === rowId && this.activeCell?.columnId === columnId;
    }
    locationFromTarget(target) {
        const cell = this.cellElementFromTarget(target);
        return cell ? this.locationFromCellElement(cell) : null;
    }
    locationFromEvent(event) {
        const cell = cellElementFromEvent(event);
        return cell ? this.locationFromCellElement(cell) : null;
    }
    cellElementFromTarget(target) {
        return eventCellElementFromTarget(target);
    }
    locationFromPointerEvent(event) {
        const fromPoint = this.locationFromPointerEventLike(event.clientX, event.clientY);
        if (fromPoint) {
            return fromPoint;
        }
        const fromTarget = this.locationFromTarget(event.target);
        if (fromTarget) {
            return fromTarget;
        }
        return this.nearestLocationForPoint(event.clientX, event.clientY);
    }
    locationFromMouseEvent(event) {
        const fromPoint = this.locationFromPointerEventLike(event.clientX, event.clientY);
        if (fromPoint) {
            return fromPoint;
        }
        return this.nearestLocationForPoint(event.clientX, event.clientY);
    }
    locationFromPointerEventLike(clientX, clientY) {
        const elementAtPoint = this.shadowRoot?.elementFromPoint(clientX, clientY);
        return this.locationFromTarget(elementAtPoint ?? null);
    }
    nearestLocationForPoint(clientX, clientY, predicate) {
        const cells = Array.from(this.shadowRoot?.querySelectorAll("td[data-row-id][data-column-id]") ?? []);
        return nearestGeometryLocationForPoint({
            cells,
            clientX,
            clientY,
            predicate,
        });
    }
    locationWithinBounds(location, bounds) {
        const rowIndex = this.#rowIndexById.get(location.rowId);
        const columnIndex = this.#columnIndexById.get(location.columnId);
        return (rowIndex !== undefined &&
            columnIndex !== undefined &&
            rowIndex >= bounds.rowStart &&
            rowIndex <= bounds.rowEnd &&
            columnIndex >= bounds.columnStart &&
            columnIndex <= bounds.columnEnd);
    }
    locationFromCellElement(cell) {
        return geometryLocationFromCellElement(cell);
    }
    cellElementForLocation(location) {
        if (!location) {
            return null;
        }
        const rowId = CSS.escape(location.rowId);
        const columnId = CSS.escape(location.columnId);
        return this.shadowRoot?.querySelector(`td[data-row-id="${rowId}"][data-column-id="${columnId}"]`);
    }
    endPointerSelection(suppressNextClick) {
        const scrollContainer = this.getScrollContainer();
        const session = this.#pointerSelectionSession;
        if (scrollContainer &&
            session.pointerId !== null &&
            scrollContainer.hasPointerCapture?.(session.pointerId)) {
            try {
                scrollContainer.releasePointerCapture(session.pointerId);
            }
            catch {
                // Ignore release failures for synthetic pointer events.
            }
        }
        this.#suppressNextGridClick = pointerSelectionSuppressesNextClick(session, suppressNextClick);
        this.#pointerSelectionSession = clearedPointerSelectionSession();
    }
    cellIdFor(rowId, columnId) {
        return `${this.localName}-cell-${this.instanceId}-${this.sanitizeForId(rowId)}-${this.sanitizeForId(columnId)}`;
    }
    cellEditorErrorIdFor(rowId, columnId) {
        return `${this.cellIdFor(rowId, columnId)}-edit-error`;
    }
    getActiveCellElement() {
        if (!this.activeCell) {
            return null;
        }
        return this.shadowRoot?.getElementById(this.cellIdFor(this.activeCell.rowId, this.activeCell.columnId));
    }
    getActiveEditorElement() {
        if (!this.editingCell) {
            return null;
        }
        return this.shadowRoot?.querySelector(`.cell-editor[data-row-id="${this.editingCell.rowId}"][data-column-id="${this.editingCell.columnId}"]`);
    }
    sanitizeForId(value) {
        return value.replace(/[^a-zA-Z0-9_-]/g, "-");
    }
    syncHostStates() {
        this.toggleState("busy", this.busy);
        this.toggleState("sticky-header", this.stickyHeader);
        this.toggleState("virtualize", this.virtualize);
        this.toggleState("empty", !(this.presentedRows?.length ?? 0));
        this.#internals.ariaBusy = this.busy ? "true" : "false";
    }
    syncRenderedRows() {
        if (!Array.isArray(this.presentedRows) || !Array.isArray(this.presentedColumns)) {
            return;
        }
        const focusedSelectionControl = this.focusedSelectionControl();
        const virtualItems = this.virtualize ? this.#rowVirtualizer.getVirtualItems() : [];
        const totalSize = this.virtualize ? this.#rowVirtualizer.getTotalSize() : 0;
        const nextState = computeRenderedRows({
            virtualize: this.virtualize,
            rows: this.presentedRows,
            estimatedRowHeight: this.estimatedRowHeight,
            virtualItems,
            totalSize,
        });
        const nextRowIndices = new Set(nextState.renderedRows.map((rendered) => rendered.item.index));
        this.recycleFocusedRowIfNeeded(nextRowIndices);
        const snapshot = this.interactionSnapshot();
        this.virtualTotalSize = totalSize;
        const canReuseRenderedRows = this.#renderedPresentationRevision === this.#presentationRevision &&
            this.#renderedInteractionRevision === this.#interactionRevision;
        const previousRowsByIndex = canReuseRenderedRows
            ? new Map(this.renderedRows.map((rendered) => [rendered.item.index, rendered]))
            : new Map();
        const nextRenderedRows = nextState.renderedRows.map((rendered) => {
            const row = this.withInteractionState(rendered.row, rendered.item.index, snapshot);
            const previous = previousRowsByIndex.get(rendered.item.index);
            if (previous?.row === row) {
                previous.item = rendered.item;
                return previous;
            }
            return {
                item: rendered.item,
                row,
            };
        });
        if (nextRenderedRows.length !== this.renderedRows.length ||
            nextRenderedRows.some((rendered, index) => rendered !== this.renderedRows[index])) {
            this.renderedRows.splice(0, this.renderedRows.length, ...nextRenderedRows);
        }
        this.#renderedPresentationRevision = this.#presentationRevision;
        this.#renderedInteractionRevision = this.#interactionRevision;
        if (this.focusMode === "cell") {
            const renderedRowIds = new Set(nextState.renderedRows.map((rendered) => rendered.row.id));
            for (const rowId of this.#decoratedRowCache.keys()) {
                if (!renderedRowIds.has(rowId)) {
                    this.#decoratedRowCache.delete(rowId);
                }
            }
        }
        else {
            this.#decoratedRowCache.clear();
        }
        this.virtualPaddingStart = nextState.virtualPaddingStart;
        this.virtualPaddingEnd = nextState.virtualPaddingEnd;
        this.scheduleRenderedRowMeasurement();
        this.restoreSelectionControlFocus(focusedSelectionControl);
    }
    focusedSelectionControl() {
        const element = this.shadowRoot?.activeElement;
        if (!(element instanceof HTMLElement))
            return null;
        const selector = element.matches("violet-radio.selection-radio")
            ? "violet-radio.selection-radio"
            : element.matches("violet-checkbox.selection-checkbox")
                ? "violet-checkbox.selection-checkbox"
                : null;
        const rowId = selector ? this.selectionControlRowId(element) : undefined;
        return selector && rowId
            ? { element, focusGeneration: this.#focusGeneration, rowId, selector }
            : null;
    }
    selectionControlRowId(element) {
        return (element
            ?.closest("tr[data-row-index]")
            ?.querySelector("td[data-row-id]")
            ?.getAttribute("data-row-id") ?? undefined);
    }
    restoreSelectionControlFocus(focused) {
        if (!focused)
            return;
        const revision = ++this.#selectionControlFocusRevision;
        Updates.enqueue(() => {
            if (revision !== this.#selectionControlFocusRevision)
                return;
            if (!this.$fastController.isConnected)
                return;
            const shadowActive = this.shadowRoot?.activeElement;
            if (shadowActive && shadowActive !== focused.element)
                return;
            if (shadowActive === focused.element &&
                this.selectionControlRowId(shadowActive) === focused.rowId)
                return;
            if (this.#focusGeneration !== focused.focusGeneration)
                return;
            const replacement = Array.from(this.shadowRoot?.querySelectorAll(focused.selector) ?? []).find((control) => this.selectionControlRowId(control) === focused.rowId);
            replacement?.focus({ preventScroll: true });
        });
    }
    #handleFocusIntent;
    interactionSnapshot() {
        return {
            selectionBounds: this.visualSelectionBounds(),
            fillPreviewBounds: this.fillPreview ? this.boundsForRange(this.fillPreview) : null,
            fillSourceBounds: this.#fillSession.sourceRange
                ? this.boundsForRange(this.#fillSession.sourceRange)
                : this.currentFillSourceBounds(),
        };
    }
    scheduleRenderedRowMeasurement() {
        if (!this.virtualize || !this.$fastController.isConnected) {
            return;
        }
        if (this.#rowMeasurementFrame !== null) {
            cancelAnimationFrame(this.#rowMeasurementFrame);
        }
        this.#rowMeasurementFrame = requestAnimationFrame(() => {
            this.#rowMeasurementFrame = null;
            if (!this.$fastController.isConnected) {
                return;
            }
            this.#rowVirtualizer.measureElement(null);
            const rows = this.shadowRoot?.querySelectorAll("tbody tr[data-index]");
            rows?.forEach((row) => this.#rowVirtualizer.measureElement(row));
        });
    }
    recycleFocusedRowIfNeeded(nextRowIndices) {
        if (!this.virtualize ||
            this.#editorRecycleInProgress ||
            (nextRowIndices.size === 0 && this.presentedRows.length > 0)) {
            return;
        }
        const editingRowIndex = this.editingCell
            ? this.#rowIndexById.get(this.editingCell.rowId)
            : undefined;
        const activeElement = this.shadowRoot?.activeElement;
        const focusedRow = activeElement?.closest?.("tr[data-row-index]");
        const focusedRowIndex = focusedRow
            ? Number.parseInt(focusedRow.dataset.rowIndex ?? "", 10)
            : Number.NaN;
        let shouldRestoreGridFocus = Number.isFinite(focusedRowIndex) && !nextRowIndices.has(focusedRowIndex);
        if (editingRowIndex !== undefined && !nextRowIndices.has(editingRowIndex)) {
            this.#editorRecycleInProgress = true;
            const editingLocation = this.editingCell;
            const editingCell = editingLocation ? this.presentedCellAt(editingLocation) : null;
            const editingSessionId = this.#editingSession?.id;
            const committed = this.commitEditingCell();
            if (!committed && editingSessionId && this.#editingSession?.id === editingSessionId) {
                const columnLabel = editingCell?.columnLabel ?? editingLocation?.columnId ?? "cell";
                this.editAnnouncement = `Unsaved invalid edit in ${columnLabel} was cancelled because its row left the visible grid.`;
                this.cancelActiveEdit();
            }
            this.#editorRecycleInProgress = false;
            shouldRestoreGridFocus = true;
        }
        if (!shouldRestoreGridFocus) {
            return;
        }
        if (this.#editorRecycleFocusFrame !== null) {
            cancelAnimationFrame(this.#editorRecycleFocusFrame);
        }
        this.#editorRecycleFocusFrame = requestAnimationFrame(() => {
            this.#editorRecycleFocusFrame = null;
            if (!this.editingCell) {
                this.getScrollContainer()?.focus({ preventScroll: true });
            }
        });
    }
    scheduleVirtualizerUpdate() {
        if (!this.$fastController.isConnected) {
            return;
        }
        if (this.#virtualizerFrame !== null) {
            cancelAnimationFrame(this.#virtualizerFrame);
        }
        this.#virtualizerFrame = requestAnimationFrame(() => {
            this.#virtualizerFrame = null;
            this.#rowVirtualizer.setOptions({
                ...this.#rowVirtualizer.options,
                ...buildVirtualizerUpdateOptions({
                    rows: this.presentedRows,
                    estimatedRowHeight: this.estimatedRowHeight,
                    overscanCount: this.overscanCount,
                    virtualize: this.virtualize,
                }),
            });
            this.#rowVirtualizer._willUpdate();
            this.#rowVirtualizer.measure();
            this.syncRenderedRows();
        });
    }
    getScrollContainer() {
        return this.shadowRoot?.querySelector(".table-scroll");
    }
    rowHeightForDensity(density) {
        switch (density) {
            case "compact":
                return 24;
            case "comfortable":
                return 44;
            default:
                return 32;
        }
    }
    toggleState(name, enabled) {
        if (enabled) {
            this.#internals.states.add(name);
            return;
        }
        this.#internals.states.delete(name);
    }
    mergePartNames(basePart, extraPart) {
        return extraPart ? `${basePart} ${extraPart}` : basePart;
    }
}
let violetDataGridInstanceCount = 0;
attr({ attribute: "selection-mode" })(VioletDataGrid.prototype, "selectionMode");
attr({ attribute: "sticky-header", mode: "boolean" })(VioletDataGrid.prototype, "stickyHeader");
attr({ mode: "boolean" })(VioletDataGrid.prototype, "busy");
attr({ mode: "boolean" })(VioletDataGrid.prototype, "virtualize");
attr({ attribute: "show-filter", mode: "boolean" })(VioletDataGrid.prototype, "showFilter");
attr(VioletDataGrid.prototype, "density");
attr({ attribute: "focus-mode" })(VioletDataGrid.prototype, "focusMode");
attr({ attribute: "sort-mode" })(VioletDataGrid.prototype, "sortMode");
observable(VioletDataGrid.prototype, "columns");
observable(VioletDataGrid.prototype, "columnWidths");
observable(VioletDataGrid.prototype, "rows");
observable(VioletDataGrid.prototype, "sort");
observable(VioletDataGrid.prototype, "filterState");
observable(VioletDataGrid.prototype, "selectedRowIds");
observable(VioletDataGrid.prototype, "presentedColumns");
observable(VioletDataGrid.prototype, "presentedRows");
observable(VioletDataGrid.prototype, "renderedRows");
observable(VioletDataGrid.prototype, "activeCell");
observable(VioletDataGrid.prototype, "cellSelection");
observable(VioletDataGrid.prototype, "editingCell");
observable(VioletDataGrid.prototype, "editingValue");
observable(VioletDataGrid.prototype, "editingError");
observable(VioletDataGrid.prototype, "editAnnouncement");
observable(VioletDataGrid.prototype, "fillPreview");
observable(VioletDataGrid.prototype, "estimatedRowHeight");
observable(VioletDataGrid.prototype, "overscanCount");
observable(VioletDataGrid.prototype, "virtualPaddingStart");
observable(VioletDataGrid.prototype, "virtualPaddingEnd");
observable(VioletDataGrid.prototype, "virtualTotalSize");
observable(VioletDataGrid.prototype, "hasToolbarSlotContent");
if (!customElements.get("violet-data-grid")) {
    await FASTElement.define(VioletDataGrid, {
        name: "violet-data-grid",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}