import { FASTElement } from "@lushly-dev/fast-element";
/**
 * Inline star rating editor for dense grid cells.
 *
 * @summary Grid-native rating control with immediate commit semantics for pointer and keyboard interaction.
 * @fires input - Emitted whenever the rating changes.
 * @fires change - Emitted whenever the rating is committed by pointer or keyboard interaction.
 * @csspart base - Root wrapper for the rating control.
 * @csspart control - Focusable interactive surface or readonly display row.
 * @csspart star - Individual star glyph.
 * @csspart summary - Compact numeric summary shown in interactive mode.
 */
export declare class VioletDataGridRating extends FASTElement {
    disabled: boolean;
    readonly: boolean;
    ariaLabel: string;
    rating: number | null;
    max: number;
    constructor();
    connectedCallback(): void;
    ratingChanged(): void;
    maxChanged(): void;
    get value(): string;
    set value(nextValue: string);
    focus(options?: FocusOptions): void;
    get resolvedMax(): number;
    get starValues(): number[];
    get interactive(): boolean;
    get selectionSummary(): string;
    get controlLabel(): string;
    get accessibleValueText(): string;
    get readonlyLabel(): string;
    isFilled(index: number): boolean;
    selectRating(nextRating: number | null): void;
    clearRating(): void;
    handleControlClick(event: MouseEvent): void;
    handleControlKeydown(event: KeyboardEvent): void;
    private emitSelectionChange;
}