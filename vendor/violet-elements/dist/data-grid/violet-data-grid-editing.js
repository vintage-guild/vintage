export function beginEditingState(location, cell, editValue) {
    if (!cell?.editable || cell.editor === "checkbox") {
        return null;
    }
    return {
        editingCell: location,
        editingValue: editValue,
    };
}
export function commitEditingState(options) {
    const nextState = clearedEditingState();
    if (!options.editingCell || !options.cell) {
        return {
            nextState,
            detail: null,
        };
    }
    return {
        nextState,
        detail: {
            rowId: options.editingCell.rowId,
            columnId: options.editingCell.columnId,
            value: options.normalizeValue(options.cell, options.editingValue),
        },
    };
}
export function cancelEditingState(editingCell) {
    return {
        nextState: clearedEditingState(),
        cancelledCell: editingCell,
    };
}
export function clearedEditingState() {
    return {
        editingCell: null,
        editingValue: "",
    };
}
export function editorStringValue(target) {
    return typeof target?.value === "string" ? target.value : "";
}
/**
 * Write the editor's starting value imperatively.
 *
 * The editor template must NOT bind `:value` reactively. That makes it a
 * controlled input, so every FAST render pass writes the model back onto the
 * element and overwrites whatever the user is typing — cell editing silently
 * refuses input. The editor owns its value while open; `handleGridInput`
 * mirrors it back into `editingValue` for commit.
 */
export function seedEditorValue(editor, value) {
    const valued = editor;
    if (!valued)
        return;
    valued.value = value;
}
export function focusEditorAtEnd(editor) {
    const focusableEditor = editor;
    focusableEditor?.focus?.({ preventScroll: true });
    if (editor instanceof HTMLTextAreaElement) {
        const end = editor.value.length;
        editor.setSelectionRange(end, end);
        return;
    }
    if (editor instanceof HTMLInputElement) {
        const end = editor.value.length;
        try {
            editor.setSelectionRange(end, end);
        }
        catch {
            // Some input types, such as number, do not support selection ranges.
        }
    }
}