import { FASTElement } from "@lushly-dev/fast-element";
import "../icon/violet-icon";
import "../icon-button/violet-icon-button";
type VioletCarouselSlide = {
    index: number;
    label: string;
};
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
export declare class VioletCarousel extends FASTElement {
    #private;
    slideCount: number;
    slides: VioletCarouselSlide[];
    appearance: "framed" | "plain";
    label: string;
    activeIndex: number;
    slidesPerView: number;
    loop: boolean;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    activeIndexChanged(): void;
    slidesPerViewChanged(): void;
    handleSlidesSlotChange(): void;
    handleViewportScroll(): void;
    handleViewportKeydown(event: KeyboardEvent): void;
    goTo(index: number): void;
    next(): void;
    previous(): void;
    get canGoPrevious(): boolean;
    get canGoNext(): boolean;
    get currentSlideStatus(): string;
    private get viewportElement();
    private get paginationElement();
    private get controlsElement();
    private get previousButtonElement();
    private get nextButtonElement();
    private get statusElement();
    private get slideElements();
}
export {};