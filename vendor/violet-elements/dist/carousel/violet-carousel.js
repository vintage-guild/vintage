var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { FASTElement, attr, css, html, observable } from "@lushly-dev/fast-element";
import { registerSystemChevronRightIcon } from "../icon/generated";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
import { violetSurfaceTokenDefaults } from "../theme/violet-token-defaults";
const integerConverter = {
    fromView(value) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : 0;
    },
    toView(value) {
        return String(value);
    },
};
function readIntegerAttribute(element, name, fallback) {
    const raw = element.getAttribute(name);
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
registerSystemChevronRightIcon();
const styles = css `
    ${violetSurfaceTokenDefaults}

    :host {
        display: block;
        min-inline-size: 0;
        color: var(--_text-primary);

        --_carousel-gap: var(--_space-md);
        --_carousel-slide-gap: var(--_space-sm);
        --_carousel-slides-per-view: 1;
        --_carousel-radius: calc(var(--_radius-md) * 2);
        --_carousel-surface: var(--_surface-card);
        --_carousel-border: var(--_border-subtle);
        --_carousel-shadow: var(--_shadow-card);
        --_carousel-dot-size: 0.625rem;
        --_carousel-dot-active: var(--color-state-success-foreground, #245c36);
        --_carousel-dot-idle: color-mix(in srgb, var(--_text-muted) 32%, transparent);
    }

    :host([appearance="plain"]) {
        --_carousel-surface: transparent;
        --_carousel-border: transparent;
        --_carousel-shadow: none;
    }

    .root {
        display: grid;
        gap: var(--_carousel-gap);
    }

    .viewport {
        box-sizing: border-box;
        overflow-x: auto;
        overflow-y: hidden;
        min-inline-size: 0;
        border: 1px solid var(--_carousel-border);
        border-radius: var(--_carousel-radius);
        background: var(--_carousel-surface);
        box-shadow: var(--_carousel-shadow);
        scroll-behavior: smooth;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
    }

    .viewport::-webkit-scrollbar {
        display: none;
    }

    .viewport:focus-visible {
        outline: 2px solid var(--_focus-ring);
        outline-offset: 2px;
    }

    .track {
        display: block;
        min-inline-size: 0;
    }

    .slides {
        display: flex;
        gap: var(--_carousel-slide-gap);
        min-inline-size: 100%;
    }

    ::slotted(*) {
        box-sizing: border-box;
        flex: 0 0 calc((100% - (var(--_carousel-slide-gap) * (var(--_carousel-slides-per-view) - 1))) / var(--_carousel-slides-per-view));
        min-inline-size: calc((100% - (var(--_carousel-slide-gap) * (var(--_carousel-slides-per-view) - 1))) / var(--_carousel-slides-per-view));
        inline-size: calc((100% - (var(--_carousel-slide-gap) * (var(--_carousel-slides-per-view) - 1))) / var(--_carousel-slides-per-view));
        scroll-snap-align: start;
        scroll-snap-stop: always;
    }

    .controls {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--_space-sm);
        min-inline-size: 0;
    }

    .controls[hidden],
    .pagination[hidden],
    .status[hidden] {
        display: none;
    }

    .previous-button violet-icon {
        transform: rotate(180deg);
    }

    .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--_space-sm);
        min-inline-size: 0;
        flex-wrap: wrap;
    }

    .dot {
        box-sizing: border-box;
        inline-size: calc(var(--_target-size) * 0.75);
        block-size: calc(var(--_target-size) * 0.75);
        min-inline-size: calc(var(--_target-size) * 0.75);
        min-block-size: calc(var(--_target-size) * 0.75);
        padding: 0;
        border: 0;
        border-radius: var(--_radius-round);
        background: transparent;
        color: inherit;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
    }

    .dot::before {
        content: "";
        inline-size: var(--_carousel-dot-size);
        block-size: var(--_carousel-dot-size);
        border-radius: var(--_radius-round);
        background: var(--_carousel-dot-idle);
        transition:
            transform var(--_duration-fast) var(--_easing-standard),
            background-color var(--_duration-fast) var(--_easing-standard);
    }

    .dot:hover::before {
        transform: scale(1.08);
    }

    .dot[aria-pressed="true"]::before {
        background: var(--_carousel-dot-active);
        transform: scale(1.2);
    }

    .dot:focus-visible {
        outline: 2px solid var(--_focus-ring);
        outline-offset: 2px;
    }

    .sr-only {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
    }

    @media (forced-colors: active) {
        .viewport {
            forced-color-adjust: none;
            background: Canvas;
            border-color: ButtonText;
            box-shadow: none;
        }

        .dot::before {
            background: GrayText;
        }

        .dot[aria-pressed="true"]::before {
            background: Highlight;
        }
    }
`;
const template = html `
    <section class="root" part="root" role="region" aria-roledescription="carousel" aria-label="${x => x.label}">
        <div
            class="viewport"
            part="viewport"
            tabindex="0"
            @scroll="${x => x.handleViewportScroll()}"
            @keydown="${(x, c) => x.handleViewportKeydown(c.event)}"
        >
            <div class="track" part="track">
                <slot class="slides" @slotchange="${x => x.handleSlidesSlotChange()}"></slot>
            </div>
        </div>

        <div class="controls" part="controls">
            <violet-icon-button
                class="previous-button"
                part="previous-button"
                appearance="quiet"
                label="Previous slide"
                @click="${x => x.previous()}"
            >
                <violet-icon icon="system/chevron-right" decorative></violet-icon>
            </violet-icon-button>

            <div class="pagination" part="pagination" role="group" aria-label="${x => `${x.label} slide navigation`}"></div>

            <violet-icon-button
                class="next-button"
                part="next-button"
                appearance="quiet"
                label="Next slide"
                @click="${x => x.next()}"
            >
                <violet-icon icon="system/chevron-right" decorative></violet-icon>
            </violet-icon-button>
        </div>

        <div class="status sr-only" part="status" aria-live="polite" aria-atomic="true"></div>
    </section>
`;
/**
 * Slotted, manual carousel for horizontally paging arbitrary content.
 *
 * @summary Scroll-snap based carousel with generated previous/next controls, pager dots, and accessible current-slide announcements.
 * @fires slide-change - Emitted when the active slide changes. Detail: `{ activeIndex, slide }`.
 * @fires change - Emitted after the active slide changes.
 * @slot - Slide content. Each top-level slotted element becomes one slide.
 * @csspart root - Carousel region wrapper.
 * @csspart viewport - Scrollable slide viewport.
 * @csspart track - Inline track that holds the slides.
 * @csspart controls - Footer row containing navigation and pagination.
 * @csspart previous-button - Built-in previous-slide icon button.
 * @csspart next-button - Built-in next-slide icon button.
 * @csspart pagination - Dot navigation wrapper.
 * @csspart dot - Individual pager button.
 * @csspart status - Screen-reader-only current slide announcement.
 */
export class VioletCarousel extends FASTElement {
    #connected = false;
    #syncingFromScroll = false;
    #scrollFrame = 0;
    constructor() {
        super();
        this.slides = [];
        this.slideCount = 0;
        this.appearance = "framed";
        this.label = "Carousel";
        this.activeIndex = 0;
        this.slidesPerView = 1;
        this.loop = false;
    }
    connectedCallback() {
        super.connectedCallback();
        this.activeIndex = readIntegerAttribute(this, "active-index", this.activeIndex || 0);
        this.slidesPerView = readIntegerAttribute(this, "slides-per-view", this.slidesPerView || 1);
        requestAnimationFrame(() => {
            if (!this.isConnected) {
                return;
            }
            this.#connected = true;
            this.#syncSlides();
            this.#applyActiveState({ scroll: false, emit: false });
        });
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this.#connected = false;
        if (this.#scrollFrame) {
            cancelAnimationFrame(this.#scrollFrame);
            this.#scrollFrame = 0;
        }
    }
    activeIndexChanged() {
        if (!this.#connected) {
            return;
        }
        this.#applyActiveState({
            scroll: !this.#syncingFromScroll,
            emit: true,
        });
    }
    slidesPerViewChanged() {
        if (!this.#connected) {
            return;
        }
        this.#applyActiveState({
            scroll: false,
            emit: false,
        });
    }
    handleSlidesSlotChange() {
        this.#syncSlides();
        this.#applyActiveState({ scroll: false, emit: false });
    }
    handleViewportScroll() {
        if (this.#scrollFrame) {
            return;
        }
        this.#scrollFrame = requestAnimationFrame(() => {
            this.#scrollFrame = 0;
            const nextIndex = this.#getNearestSlideIndex();
            if (nextIndex === this.activeIndex) {
                return;
            }
            this.#syncingFromScroll = true;
            this.activeIndex = nextIndex;
            this.#syncingFromScroll = false;
        });
    }
    handleViewportKeydown(event) {
        if (event.defaultPrevented || this.slides.length < 2) {
            return;
        }
        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                this.next();
                break;
            case "ArrowLeft":
                event.preventDefault();
                this.previous();
                break;
            case "Home":
                event.preventDefault();
                this.goTo(0);
                break;
            case "End":
                event.preventDefault();
                this.goTo(this.#maxStartIndex);
                break;
            default:
                break;
        }
    }
    goTo(index) {
        const nextIndex = this.#clampIndex(index);
        if (nextIndex === this.activeIndex) {
            return;
        }
        this.activeIndex = nextIndex;
    }
    next() {
        if (this.slides.length < 2) {
            return;
        }
        if (this.loop) {
            this.goTo((this.activeIndex + 1) % (this.#maxStartIndex + 1));
            return;
        }
        this.goTo(this.activeIndex + 1);
    }
    previous() {
        if (this.slides.length < 2) {
            return;
        }
        if (this.loop) {
            this.goTo((this.activeIndex - 1 + this.#maxStartIndex + 1) % (this.#maxStartIndex + 1));
            return;
        }
        this.goTo(this.activeIndex - 1);
    }
    get canGoPrevious() {
        return this.slideCount > 1 && (this.loop || this.activeIndex > 0);
    }
    get canGoNext() {
        return this.slideCount > 1 && (this.loop || this.activeIndex < this.#maxStartIndex);
    }
    get currentSlideStatus() {
        if (this.slideCount < 1) {
            return "";
        }
        const start = this.#clampIndex(this.activeIndex);
        const visibleCount = this.#normalizedSlidesPerView;
        const end = Math.min(this.slideCount, start + visibleCount);
        const current = this.slides[start];
        if (visibleCount === 1) {
            return `${current?.label ?? `Slide ${start + 1}`} (${start + 1} of ${this.slideCount})`;
        }
        return `Showing slides ${start + 1} through ${end} of ${this.slideCount}`;
    }
    #syncSlides() {
        const slides = this.slideElements;
        slides.forEach((slide, index) => {
            slide.dataset.carouselIndex = String(index);
            slide.dataset.carouselLabel = this.#resolveSlideLabel(slide, index);
        });
        this.slides = slides.map((slide, index) => ({
            index,
            label: slide.dataset.carouselLabel ?? `Slide ${index + 1}`,
        }));
        this.slideCount = this.slides.length;
        this.#renderPagination();
        this.#syncChromeState();
    }
    #applyActiveState(options) {
        const clamped = this.#clampIndex(this.activeIndex);
        if (clamped !== this.activeIndex) {
            this.activeIndex = clamped;
            return;
        }
        const slides = this.slideElements;
        const activeSlide = slides[clamped] ?? null;
        slides.forEach((slide, index) => {
            const isActive = index >= clamped && index < clamped + this.#normalizedSlidesPerView;
            slide.toggleAttribute("data-active", isActive);
            slide.toggleAttribute("inert", !isActive);
            slide.setAttribute("aria-hidden", String(!isActive));
        });
        this.#syncPaginationState();
        this.#syncChromeState();
        if (options.scroll && activeSlide) {
            this.#scrollToSlide(activeSlide);
        }
        if (options.emit && activeSlide) {
            this.$emit("slide-change", {
                activeIndex: clamped,
                slide: activeSlide,
            });
            this.$emit("change");
        }
    }
    #scrollToSlide(slide) {
        const viewport = this.viewportElement;
        if (!viewport) {
            return;
        }
        const left = slide.offsetLeft;
        if (typeof viewport.scrollTo === "function") {
            viewport.scrollTo({
                left,
                behavior: "smooth",
            });
            return;
        }
        viewport.scrollLeft = left;
    }
    #getNearestSlideIndex() {
        const viewport = this.viewportElement;
        const slides = this.slideElements;
        if (!viewport || slides.length < 2) {
            return 0;
        }
        const currentOffset = viewport.scrollLeft;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        slides.forEach((slide, index) => {
            const distance = Math.abs(slide.offsetLeft - currentOffset);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });
        return nearestIndex;
    }
    #resolveSlideLabel(slide, index) {
        return (slide.getAttribute("data-label") ??
            slide.getAttribute("aria-label") ??
            slide.getAttribute("title") ??
            `Slide ${index + 1}`);
    }
    #clampIndex(index) {
        if (this.slideCount < 1) {
            return 0;
        }
        return Math.max(0, Math.min(index, this.#maxStartIndex));
    }
    get #normalizedSlidesPerView() {
        if (this.slideCount < 1) {
            return Math.max(1, this.slidesPerView || 1);
        }
        return Math.max(1, Math.min(this.slidesPerView || 1, this.slideCount));
    }
    get #maxStartIndex() {
        return Math.max(0, this.slideCount - this.#normalizedSlidesPerView);
    }
    get #pageStarts() {
        return Array.from({ length: this.#maxStartIndex + 1 }, (_, index) => index);
    }
    #renderPagination() {
        const pagination = this.paginationElement;
        if (!pagination) {
            return;
        }
        pagination.replaceChildren();
        this.#pageStarts.forEach(startIndex => {
            const button = document.createElement("button");
            button.className = "dot";
            button.part.add("dot");
            button.type = "button";
            const start = startIndex + 1;
            const end = Math.min(this.slideCount, startIndex + this.#normalizedSlidesPerView);
            button.setAttribute("aria-label", this.#normalizedSlidesPerView === 1
                ? `Go to ${this.slides[startIndex]?.label ?? `slide ${start}`}`
                : `Go to slides ${start} through ${end}`);
            button.addEventListener("click", () => {
                this.goTo(startIndex);
            });
            pagination.append(button);
        });
        this.#syncPaginationState();
    }
    #syncPaginationState() {
        const buttons = Array.from(this.shadowRoot?.querySelectorAll(".dot") ?? []);
        buttons.forEach((button, index) => {
            button.setAttribute("aria-pressed", String(this.#pageStarts[index] === this.activeIndex));
        });
    }
    #syncChromeState() {
        this.style.setProperty("--_carousel-slides-per-view", String(this.#normalizedSlidesPerView));
        const hasMultiplePages = this.#maxStartIndex > 0;
        const controls = this.controlsElement;
        if (controls) {
            controls.hidden = !hasMultiplePages;
        }
        const previousButton = this.previousButtonElement;
        if (previousButton) {
            previousButton.disabled = !this.canGoPrevious;
        }
        const nextButton = this.nextButtonElement;
        if (nextButton) {
            nextButton.disabled = !this.canGoNext;
        }
        const status = this.statusElement;
        if (status) {
            status.hidden = !hasMultiplePages;
            status.textContent = this.currentSlideStatus;
        }
    }
    get viewportElement() {
        return this.shadowRoot?.querySelector(".viewport") ?? null;
    }
    get paginationElement() {
        return this.shadowRoot?.querySelector(".pagination") ?? null;
    }
    get controlsElement() {
        return this.shadowRoot?.querySelector(".controls") ?? null;
    }
    get previousButtonElement() {
        return this.shadowRoot?.querySelector(".previous-button");
    }
    get nextButtonElement() {
        return this.shadowRoot?.querySelector(".next-button");
    }
    get statusElement() {
        return this.shadowRoot?.querySelector(".status") ?? null;
    }
    get slideElements() {
        const slot = this.shadowRoot?.querySelector("slot");
        return (slot?.assignedElements({ flatten: true }) ?? []).filter((node) => node instanceof HTMLElement);
    }
}
__decorate([
    observable
], VioletCarousel.prototype, "slideCount", void 0);
attr(VioletCarousel.prototype, "appearance");
attr(VioletCarousel.prototype, "label");
attr({ attribute: "active-index", converter: integerConverter })(VioletCarousel.prototype, "activeIndex");
attr({ attribute: "slides-per-view", converter: integerConverter })(VioletCarousel.prototype, "slidesPerView");
attr({ mode: "boolean" })(VioletCarousel.prototype, "loop");
if (!customElements.get("violet-carousel")) {
    await FASTElement.define(VioletCarousel, {
        name: "violet-carousel",
        template,
        styles,
        shadowOptions: {
            delegatesFocus: true,
        },
    });
}