import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Violet pagination navigation.
 *
 * @summary Token-driven page navigation control with accessible current-page semantics and router-agnostic change events.
 * @fires page-change - Emitted when the current page changes. The event detail contains `{ page }`.
 * @fires change - Emitted after the current page changes.
 * @csspart nav - Navigation wrapper.
 * @csspart list - Ordered list wrapper.
 * @csspart item - Generic list item wrapper.
 * @csspart button - Generic interactive button.
 * @csspart previous-button - Previous-page button.
 * @csspart next-button - Next-page button.
 * @csspart page-button - Non-current numbered page button.
 * @csspart current-button - Current page button.
 * @csspart ellipsis - Collapsed-range marker.
 */
export declare class VioletPagination extends FASTElement {
    #private;
    label: string;
    disabled: boolean;
    page: number;
    pageCount: number;
    siblingCount: number;
    boundaryCount: number;
    constructor();
    connectedCallback(): void;
    pageChanged(): void;
    pageCountChanged(): void;
    siblingCountChanged(): void;
    boundaryCountChanged(): void;
    goPrevious(): void;
    goNext(): void;
    goToPage(nextPage: number): void;
    private get listElement();
}