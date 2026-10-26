export interface VioletDataGridEditingLocationLike {
    rowId: string;
    columnId: string;
}
export interface VioletDataGridEditableCellLike {
    editable: boolean;
    editor: string;
}
export interface VioletDataGridEditingState<Location> {
    editingCell: Location | null;
    editingValue: string;
}
export interface VioletDataGridEditingCommitDetail {
    rowId: string;
    columnId: string;
    value: unknown;
}
export declare function beginEditingState<Location>(location: Location, cell: VioletDataGridEditableCellLike | null, editValue: string): VioletDataGridEditingState<Location> | null;
export declare function commitEditingState<Location extends VioletDataGridEditingLocationLike, Cell>(options: {
    editingCell: Location | null;
    editingValue: string;
    cell: Cell | null;
    normalizeValue: (cell: Cell, value: unknown) => unknown;
}): {
    nextState: VioletDataGridEditingState<Location>;
    detail: VioletDataGridEditingCommitDetail | null;
};
export declare function cancelEditingState<Location>(editingCell: Location | null): {
    nextState: VioletDataGridEditingState<Location>;
    cancelledCell: Location | null;
};
export declare function clearedEditingState<Location>(): VioletDataGridEditingState<Location>;
export declare function editorStringValue(target: {
    value?: string;
} | null): string;
/**
 * Write the editor's starting value imperatively.
 *
 * The editor template must NOT bind `:value` reactively. That makes it a
 * controlled input, so every FAST render pass writes the model back onto the
 * element and overwrites whatever the user is typing — cell editing silently
 * refuses input. The editor owns its value while open; `handleGridInput`
 * mirrors it back into `editingValue` for commit.
 */
export declare function seedEditorValue(editor: HTMLElement | null, value: string): void;
export declare function focusEditorAtEnd(editor: HTMLElement | null): void;