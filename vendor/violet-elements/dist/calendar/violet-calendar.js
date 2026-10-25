var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable, repeat } from "@lushly-dev/fast-element";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
import { addDays, addMonths, addYears, buildMonthGrid, clampDate, compareIsoDates, formatIsoDate, getMonthLabel, getWeekdayLabels, parseIsoDate, resolveWeekStart, } from "../date-time/violet-date-utils";
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: grid;
        inline-size: min(100%, var(--violet-calendar-inline-size, 18rem));
        color: var(--_text-primary);
        --_calendar-radius: calc(var(--_radius-md) * 2);
        --_calendar-cell-size: clamp(2rem, 6vw, 2.25rem);
        --_calendar-accent: var(--color-state-success-foreground, #245c36);
        --_calendar-accent-soft: color-mix(in srgb, var(--_calendar-accent) 16%, transparent);
    }

    .root {
        display: grid;
        gap: var(--_space-md);
        padding: var(--_space-md);
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_calendar-radius);
        background: var(--_surface-card);
        box-shadow: var(--_shadow-card);
    }

    .header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--_space-sm);
    }

    .heading {
        justify-self: center;
        font-size: var(--_body-size);
        font-weight: 600;
        line-height: var(--_body-line);
    }

    .nav {
        box-sizing: border-box;
        display: inline-grid;
        place-items: center;
        inline-size: var(--_calendar-cell-size);
        block-size: var(--_calendar-cell-size);
        border: 1px solid var(--_border-subtle);
        border-radius: var(--_radius-round);
        background: var(--_surface-card);
        color: inherit;
        cursor: pointer;
        transition:
            border-color var(--_duration-fast) var(--_easing-standard),
            background-color var(--_duration-fast) var(--_easing-standard);
    }

    .nav:hover {
        background: var(--_surface-hover);
    }

    .nav:focus-visible,
    .day-button:focus-visible {
        outline: none;
        border-color: color-mix(in srgb, var(--_focus-ring) 48%, var(--_border-subtle));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--_focus-ring) 35%, transparent);
    }

    .weekday-row,
    .week {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 2px;
    }

    .weekday {
        display: grid;
        place-items: center;
        block-size: calc(var(--_calendar-cell-size) * 0.75);
        color: var(--_text-muted);
        font-size: var(--_caption-size);
        line-height: var(--_caption-line);
    }

    .day-cell {
        display: grid;
    }

    .day-cell.range {
        background: var(--_calendar-accent-soft);
    }

    .day-button {
        box-sizing: border-box;
        display: inline-grid;
        place-items: center;
        inline-size: 100%;
        block-size: var(--_calendar-cell-size);
        padding: 0;
        border: 1px solid transparent;
        border-radius: var(--_radius-round);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-size: var(--_body-size);
        line-height: 1;
    }

    .day-button.current-month {
        color: var(--_text-primary);
    }

    .day-button.other-month {
        color: var(--_text-muted);
    }

    .day-button:hover:not(:disabled) {
        background: color-mix(in srgb, var(--_calendar-accent) 10%, transparent);
    }

    .day-button.selected {
        background: var(--_calendar-accent);
        color: white;
    }

    .day-button.range-start,
    .day-button.range-end {
        background: var(--_calendar-accent);
        color: white;
    }

    .day-button.today:not(.selected):not(.range-start):not(.range-end) {
        border-color: color-mix(in srgb, var(--_calendar-accent) 35%, transparent);
    }

    .day-button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    :host([disabled]) .root {
        opacity: 0.7;
    }

    @media (forced-colors: active) {
        .root,
        .nav,
        .day-button {
            forced-color-adjust: none;
            background: Canvas;
            color: CanvasText;
            border-color: ButtonText;
            box-shadow: none;
        }

        .day-button.selected,
        .day-button.range-start,
        .day-button.range-end {
            background: Highlight;
            color: HighlightText;
            border-color: Highlight;
        }

        .day-cell.range {
            background: Canvas;
        }
    }
`;
const template = html `
    <div class="root" part="root">
        <div class="header" part="header">
            <button class="nav" part="previous-month" type="button" ?disabled="${x => x.disabled}" aria-label="Previous month" @click="${x => x.showPreviousMonth()}">
                &lsaquo;
            </button>
            <div class="heading" part="heading" aria-live="polite">${x => x.monthLabel}</div>
            <button class="nav" part="next-month" type="button" ?disabled="${x => x.disabled}" aria-label="Next month" @click="${x => x.showNextMonth()}">
                &rsaquo;
            </button>
        </div>
        <div class="weekday-row" part="weekday-row">
            ${repeat(x => x.weekdayLabels, html `
                    <div class="weekday" part="weekday" abbr="${x => x.long}" aria-label="${x => x.long}">${x => x.short}</div>
                `)}
        </div>
        <div
            class="grid"
            part="grid"
            role="grid"
            aria-label="${x => x.monthLabel}"
            @focusin="${(x, c) => x.handleGridFocusIn(c.event)}"
            @click="${(x, c) => x.handleGridClick(c.event)}"
            @keydown="${(x, c) => x.handleGridKeydown(c.event)}"
        >
            ${repeat(x => x.weeks, html `
                    <div class="week" part="week" role="row">
                        ${repeat(x => x, html `
                                <div class="${x => `day-cell${x.inRange ? " range" : ""}`}" part="day-cell" role="gridcell" aria-selected="${x => String(x.selected)}">
                                    <button
                                        class="${x => [
    "day-button",
    x.currentMonth ? "current-month" : "other-month",
    x.selected ? "selected" : "",
    x.rangeStart ? "range-start" : "",
    x.rangeEnd ? "range-end" : "",
    x.today ? "today" : "",
]
    .filter(Boolean)
    .join(" ")}"
                                        part="day-button"
                                        type="button"
                                        data-date="${x => x.iso}"
                                        tabindex="${x => String(x.tabIndex)}"
                                        ?disabled="${x => x.disabled}"
                                        aria-label="${x => x.label}"
                                    >
                                        ${x => x.day}
                                    </button>
                                </div>
                            `)}
                    </div>
                `)}
        </div>
    </div>
`;
/**
 * Calendar grid primitive for date and range selection.
 *
 * @summary Locale-aware month calendar with keyboard navigation and single/range selection support.
 * @fires input - Emitted when the focused selection changes. Detail: `{ value }` or `{ start, end }`.
 * @fires change - Emitted when a date or range is committed. Detail: `{ value }` or `{ start, end }`.
 * @csspart root - Calendar surface wrapper.
 * @csspart header - Header row with title and nav buttons.
 * @csspart previous-month - Previous month navigation button.
 * @csspart next-month - Next month navigation button.
 * @csspart heading - Visible month and year label.
 * @csspart weekday-row - Weekday header row.
 * @csspart weekday - Weekday header cell.
 * @csspart grid - Calendar grid wrapper.
 * @csspart week - One calendar week row.
 * @csspart day-cell - Grid cell wrapper for a day.
 * @csspart day-button - Interactive day button.
 */
export class VioletCalendar extends FASTElement {
    constructor() {
        super();
        this.disabledDates = null;
        this.locale = "";
        this.selectionMode = "single";
        this.value = "";
        this.start = "";
        this.end = "";
        this.min = "";
        this.max = "";
        this.disabled = false;
        this.weekStartDay = -1;
        const today = new Date();
        this.monthDate = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);
        this.focusedDate = formatIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0));
    }
    connectedCallback() {
        super.connectedCallback();
        this.#syncMonthFromValue();
        this.#syncFocusedDate();
    }
    get resolvedLocale() {
        return this.locale || document.documentElement.lang || navigator.language || "en-US";
    }
    get resolvedWeekStartDay() {
        return resolveWeekStart(this.resolvedLocale, this.weekStartDay >= 0 ? this.weekStartDay : undefined);
    }
    get weekdayLabels() {
        return getWeekdayLabels(this.resolvedLocale, this.resolvedWeekStartDay);
    }
    get monthLabel() {
        return getMonthLabel(this.resolvedLocale, this.monthDate);
    }
    get weeks() {
        return buildMonthGrid({
            locale: this.resolvedLocale,
            monthDate: this.monthDate,
            weekStartDay: this.resolvedWeekStartDay,
            value: this.selectionMode === "single" ? this.value : "",
            start: this.selectionMode === "range" ? this.start : "",
            end: this.selectionMode === "range" ? this.end : "",
            focused: this.focusedDate,
            min: this.min,
            max: this.max,
            disabledDate: this.disabledDates,
        });
    }
    valueChanged() {
        if (this.selectionMode === "single") {
            this.#syncMonthFromValue();
            this.#syncFocusedDate();
        }
    }
    startChanged() {
        if (this.selectionMode === "range") {
            this.#syncMonthFromValue();
            this.#syncFocusedDate();
        }
    }
    endChanged() {
        if (this.selectionMode === "range") {
            this.#syncFocusedDate();
        }
    }
    localeChanged() {
        this.$emit("locale-change", { locale: this.resolvedLocale });
    }
    showPreviousMonth() {
        this.monthDate = addMonths(this.monthDate, -1);
        this.#ensureFocusedDateVisible();
    }
    showNextMonth() {
        this.monthDate = addMonths(this.monthDate, 1);
        this.#ensureFocusedDateVisible();
    }
    handleDayFocus(iso) {
        this.focusedDate = iso;
    }
    handleDayFocusEvent(event) {
        const target = event.currentTarget;
        const iso = target?.getAttribute("data-date") ?? "";
        if (iso) {
            this.handleDayFocus(iso);
        }
    }
    handleGridFocusIn(event) {
        const target = event.target;
        const iso = target?.closest("[data-date]")?.getAttribute("data-date") ?? "";
        if (iso) {
            this.handleDayFocus(iso);
        }
    }
    handleDaySelect(iso) {
        if (this.disabled || this.#isDisabledDate(iso)) {
            return;
        }
        if (this.selectionMode === "range") {
            if (!this.start || (this.start && this.end)) {
                this.start = iso;
                this.end = "";
            }
            else if (compareIsoDates(iso, this.start) < 0) {
                this.start = iso;
                this.end = "";
            }
            else {
                this.end = iso;
            }
            this.focusedDate = iso;
            this.$emit("input", { start: this.start || null, end: this.end || null });
            this.$emit("change", { start: this.start || null, end: this.end || null });
            return;
        }
        this.value = iso;
        this.focusedDate = iso;
        this.$emit("input", { value: this.value });
        this.$emit("change", { value: this.value });
    }
    handleDaySelectEvent(event) {
        const target = event.currentTarget;
        const iso = target?.getAttribute("data-date") ?? "";
        if (iso) {
            this.handleDaySelect(iso);
        }
    }
    handleGridClick(event) {
        const target = event.target;
        const iso = target?.closest("[data-date]")?.getAttribute("data-date") ?? "";
        if (iso) {
            this.handleDaySelect(iso);
        }
    }
    handleGridKeydown(event) {
        if (this.disabled) {
            return;
        }
        const current = parseIsoDate(this.focusedDate) ?? parseIsoDate(this.value) ?? parseIsoDate(this.start) ?? new Date();
        let next = null;
        switch (event.key) {
            case "ArrowLeft":
                next = addDays(current, -1);
                break;
            case "ArrowRight":
                next = addDays(current, 1);
                break;
            case "ArrowUp":
                next = addDays(current, -7);
                break;
            case "ArrowDown":
                next = addDays(current, 7);
                break;
            case "Home":
                next = addDays(current, -((current.getDay() - this.resolvedWeekStartDay + 7) % 7));
                break;
            case "End":
                next = addDays(current, 6 - ((current.getDay() - this.resolvedWeekStartDay + 7) % 7));
                break;
            case "PageUp":
                next = event.shiftKey ? addYears(current, -1) : addMonths(current, -1);
                break;
            case "PageDown":
                next = event.shiftKey ? addYears(current, 1) : addMonths(current, 1);
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                this.handleDaySelect(this.focusedDate);
                return;
            default:
                return;
        }
        event.preventDefault();
        const clamped = clampDate(next ?? current, this.min, this.max);
        this.focusedDate = formatIsoDate(clamped);
        this.monthDate = new Date(clamped.getFullYear(), clamped.getMonth(), 1, 12, 0, 0, 0);
        requestAnimationFrame(() => this.#focusActiveDay());
    }
    #syncMonthFromValue() {
        const selected = parseIsoDate(this.selectionMode === "range" ? this.start : this.value);
        if (selected) {
            this.monthDate = new Date(selected.getFullYear(), selected.getMonth(), 1, 12, 0, 0, 0);
        }
    }
    #syncFocusedDate() {
        const selected = this.selectionMode === "range" ? this.end || this.start : this.value;
        if (selected) {
            this.focusedDate = selected;
            return;
        }
        if (!parseIsoDate(this.focusedDate)) {
            const today = new Date();
            this.focusedDate = formatIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0));
        }
    }
    #ensureFocusedDateVisible() {
        const current = parseIsoDate(this.focusedDate);
        if (!current) {
            return;
        }
        if (current.getMonth() !== this.monthDate.getMonth() || current.getFullYear() !== this.monthDate.getFullYear()) {
            this.focusedDate = formatIsoDate(new Date(this.monthDate.getFullYear(), this.monthDate.getMonth(), 1, 12, 0, 0, 0));
        }
        requestAnimationFrame(() => this.#focusActiveDay());
    }
    #focusActiveDay() {
        const button = this.shadowRoot?.querySelector(`[data-date="${this.focusedDate}"]`);
        button?.focus();
    }
    #isDisabledDate(iso) {
        return Boolean((this.min && iso < this.min) || (this.max && iso > this.max) || this.disabledDates?.(iso));
    }
}
__decorate([
    observable
], VioletCalendar.prototype, "monthDate", void 0);
__decorate([
    observable
], VioletCalendar.prototype, "focusedDate", void 0);
__decorate([
    observable
], VioletCalendar.prototype, "weekStartDay", void 0);
attr({ attribute: "selection-mode" })(VioletCalendar.prototype, "selectionMode");
attr(VioletCalendar.prototype, "locale");
attr(VioletCalendar.prototype, "value");
attr(VioletCalendar.prototype, "start");
attr(VioletCalendar.prototype, "end");
attr(VioletCalendar.prototype, "min");
attr(VioletCalendar.prototype, "max");
attr({ mode: "boolean" })(VioletCalendar.prototype, "disabled");
if (!customElements.get("violet-calendar")) {
    await FASTElement.define(VioletCalendar, {
        name: "violet-calendar",
        template,
        styles,
    });
}