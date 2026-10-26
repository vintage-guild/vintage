import { FASTElement } from "@lushly-dev/fast-element";
/** A calendar-day string in strict `YYYY-MM-DD` form. */
export type VioletGanttDate = string;
/** An explicit half-open range of calendar days. */
export interface VioletGanttRange {
    start: VioletGanttDate;
    endExclusive: VioletGanttDate;
}
/** Calendar-day geometry. Instants must be projected by the consumer before rendering. */
export type VioletGanttTime = {
    kind: "day-range";
    start: VioletGanttDate;
    endExclusive: VioletGanttDate;
} | {
    kind: "day-point";
    at: VioletGanttDate;
};
export type VioletGanttPresentation = "work" | "window" | "milestone";
export type VioletGanttProvenance = "planned" | "derived" | "actual" | "advisory";
export type VioletGanttScale = "day" | "week" | "month";
export type VioletGanttDensity = "compact" | "natural" | "comfortable";
/** Supported calendar-day values and maximum rendered viewport span. */
export declare const VIOLET_GANTT_DATE_LIMITS: Readonly<{
    readonly min: "0000-01-01";
    readonly max: "9999-12-30";
    readonly endExclusive: "9999-12-31";
    readonly maxViewportDays: 36600;
}>;
/** A stable, domain-neutral logical row. `itemIds` controls item order within the row. */
export interface VioletGanttRow {
    id: string;
    parentId?: string;
    label: string;
    itemIds: readonly string[];
    description?: string;
}
/**
 * A read-only item. Work represents a scheduled interval, window an availability or
 * estimated interval, and milestone a calendar-day point. A null time is unscheduled.
 */
export interface VioletGanttItem {
    id: string;
    rowId: string;
    label: string;
    time: VioletGanttTime | null;
    presentation: VioletGanttPresentation;
    provenance: VioletGanttProvenance;
    note?: string;
    readOnlyReason?: string;
}
/** The controlled range and presentation scale. Range ends are always exclusive. */
export interface VioletGanttViewport extends VioletGanttRange {
    scale: VioletGanttScale;
}
/** Consumer-owned surface status. */
export interface VioletGanttStatus {
    kind: "ready" | "loading" | "empty" | "error";
    message?: string;
}
export interface VioletGanttItemSelectionChangeDetail {
    itemId: string | null;
}
export interface VioletGanttItemActivateDetail {
    itemId: string;
}
export interface VioletGanttRowInspectDetail {
    rowId: string;
}
export interface VioletGanttExpandedChangeDetail {
    expandedRowIds: readonly string[];
}
export interface VioletGanttViewportChangeDetail {
    viewport: VioletGanttViewport;
    reason: "pan" | "today" | "fit" | "programmatic" | "resize";
}
interface PresentedRow {
    row: VioletGanttRow;
    logicalIndex: number;
    level: number;
    positionInSet: number;
    setSize: number;
    parentId: string | null;
    hasChildren: boolean;
    expanded: boolean;
}
interface RenderedDay {
    date: VioletGanttDate;
    label: string;
    title: string;
    style: string;
    gridStyle: string;
    gridBoundary: boolean;
}
interface RenderedItem {
    item: VioletGanttItem;
    style: string;
    className: string;
    partName: string;
    selected: boolean;
    active: boolean;
    title: string;
    elementId: string;
}
interface RenderedRow extends PresentedRow {
    style: string;
    indentStyle: string;
    items: RenderedItem[];
    tabIndex: string;
    activeDescendant: string | null;
    overflowCount: number;
    singleItemOverflow: boolean;
}
/**
 * Read-only, virtualized calendar-day Gantt foundation.
 *
 * @summary Renders controlled hierarchical rows and read-only day ranges, windows, milestones, and unscheduled items.
 * @remarks Dates are strict `YYYY-MM-DD` values and range ends are exclusive. Supported dates are
 * 0000-01-01 through 9999-12-30, with 9999-12-31 as the final exclusive boundary;
 * a viewport may span at most 36,600 days. Invalid, duplicate,
 * orphaned, cyclic, mismatched, or unsupported records are omitted and reported in the visible status.
 * The host must fill a definite-height parent. Density sets a 36px compact, 64px natural, or
 * 76px comfortable minimum; rows grow in 24px item lanes, capped at six visible lanes with
 * overflow controls for the remainder. The component is presentational and intentionally not form-associated.
 * @fires item-selection-change - Requests a controlled item selection. Detail: `{ itemId }`.
 * @fires item-activate - Activates or inspects an item. Detail: `{ itemId }`.
 * @fires row-inspect - Activates or inspects a row without selecting its children. Detail: `{ rowId }`.
 * @fires expanded-change - Requests controlled expansion state. Detail: `{ expandedRowIds }`.
 * @fires viewport-change - Requests a controlled viewport. Detail: `{ viewport, reason }`.
 * @slot toolbar - Consumer-owned presentation controls such as zoom, fit, Today, and pan actions.
 * @csspart root - Outer component surface.
 * @csspart toolbar - Optional consumer toolbar region.
 * @csspart viewport - The one shared vertical and horizontal scroll viewport.
 * @csspart canvas - Virtual treegrid canvas.
 * @csspart header - Sticky header row.
 * @csspart name-header - Sticky name column header.
 * @csspart time-header - Time-axis header.
 * @csspart axis-context - Persistent year context at month scale, month and year at finer scales.
 * @csspart day - A mounted, visible calendar-day header.
 * @csspart body - Virtual row body.
 * @csspart row - A mounted logical row.
 * @csspart row-header - Sticky row-name cell.
 * @csspart row-label - Row inspection action.
 * @csspart chart - Time-axis cell for a row.
 * @csspart item - A read-only scheduled item.
 * @csspart window - A read-only availability or estimated interval.
 * @csspart milestone - A read-only calendar-day point.
 * @csspart unscheduled - A read-only item without calendar geometry.
 * @csspart overflow - Reports items beyond visible lane capacity beside pointer-accessible cycling controls.
 * @csspart selection - The controlled selected item.
 * @csspart status - Loading, empty, error, or invalid-data status.
 * @cssproperty --violet-gantt-name-column-width - Sticky row-name column width; defaults to 16rem.
 * @cssproperty --violet-gantt-name-column-width-narrow - Name width below the 34rem container breakpoint; defaults to 10rem.
 * @cssproperty --violet-gantt-work-background - Scheduled interval background.
 * @cssproperty --violet-gantt-work-foreground - Scheduled interval text color.
 * @cssproperty --violet-gantt-window-background - Window background.
 * @cssproperty --violet-gantt-window-foreground - Window text color.
 * @cssproperty --violet-gantt-actual-border - Non-color-only underline for actual provenance.
 * @cssproperty --violet-gantt-advisory-border - Leading edge for advisory provenance, paired with a glyph.
 * @cssproperty --violet-gantt-selection-ring - Controlled selection ring.
 */
export declare class VioletGantt extends FASTElement {
    #private;
    /** Controlled logical rows. */
    rows: readonly VioletGanttRow[];
    /** Controlled read-only items. */
    items: readonly VioletGanttItem[];
    /** Controlled expanded group row identities. */
    expandedRowIds: readonly string[];
    /** Controlled selected item identity. Selection does not move keyboard focus. */
    selectedItemId: string | null;
    /** Controlled half-open viewport and scale. */
    viewport: VioletGanttViewport;
    /** Consumer-owned surface status. */
    status: VioletGanttStatus;
    /** Explicit consumer-supplied calendar day for `showToday`; null disables the action. */
    today: VioletGanttDate | null;
    /** Mounted rows for the current measured viewport plus overscan. */
    renderedRows: RenderedRow[];
    /** Mounted day headers for the horizontal viewport plus overscan. */
    renderedDays: RenderedDay[];
    /** Visible calendar context for the leading day in the horizontal window. */
    axisContextLabel: string;
    axisContextStyle: string;
    validationMessage: string;
    viewportError: string;
    activeRowId: string | null;
    activeItemId: string | null;
    viewportWidth: number;
    viewportHeight: number;
    scrollTop: number;
    scrollLeft: number;
    hasToolbarContent: boolean;
    /** Density controls the minimum logical row height; rows grow to fit visible item lanes. */
    density: VioletGanttDensity;
    /** BCP 47 locale used only for visible calendar labels. */
    locale: string;
    /** Accessible name for the treegrid. */
    ariaLabel: string;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    rowsChanged(): void;
    itemsChanged(): void;
    expandedRowIdsChanged(): void;
    selectedItemIdChanged(): void;
    viewportChanged(): void;
    statusChanged(): void;
    localeChanged(): void;
    densityChanged(): void;
    get instructionsId(): string;
    get rowHeight(): number;
    get dayWidth(): number;
    get logicalRowCount(): number;
    get chartWidth(): number;
    get gridStyle(): string;
    get bodyStyle(): string;
    get effectiveStatusKind(): VioletGanttStatus["kind"];
    get statusText(): string;
    get shouldShowStatus(): boolean;
    handleScroll(): void;
    handleToolbarSlotChange(event?: Event): void;
    handleFocusIn(event: FocusEvent): void;
    handleClick(event: Event): void;
    handleKeydown(event: KeyboardEvent): void;
    /** Focuses and reveals an item when its logical row and date are in the current viewport. */
    focusItem(itemId: string): boolean;
    /** Scrolls to a date in the current viewport, or requests a centered viewport when outside it. */
    scrollToDate(date: VioletGanttDate): boolean;
    /** Requests the same viewport span shifted by a number of calendar days. */
    panBy(days: number): boolean;
    /** Requests a viewport centered on the explicit consumer-supplied `today`; no-op when absent or invalid. */
    showToday(): boolean;
    /** Requests the smallest supported day range containing every valid scheduled item. */
    fitItems(): boolean;
    get resolvedLocale(): string;
}
export {};