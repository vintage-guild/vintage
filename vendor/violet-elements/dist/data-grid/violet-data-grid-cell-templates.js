import { html, repeat } from "@lushly-dev/fast-element";
export const defaultCellContentTemplate = html `
    <span class="cell-content">${(x) => x.text}</span>
`;
export const inputCellEditorTemplate = html `
    <input
        class="cell-editor"
        data-cell-editor="${(x) => x.editor}"
        data-row-id="${(x) => x.rowId}"
        data-column-id="${(x) => x.columnId}"
        aria-label="${(x) => `Edit ${x.columnLabel} for ${x.rowLabel}`}"
        aria-invalid="${(x) => (x.editingError ? "true" : "false")}"
        aria-errormessage="${(x) => (x.editingError ? x.editingErrorId : null)}"
        inputmode="${(x) => (x.editor === "number" ? "decimal" : null)}"
        type="text"
    />
`;
export const selectCellEditorTemplate = html `
    <select
        class="cell-editor"
        data-cell-editor="select"
        data-row-id="${(x) => x.rowId}"
        data-column-id="${(x) => x.columnId}"
        aria-label="${(x) => `Edit ${x.columnLabel} for ${x.rowLabel}`}"
        aria-invalid="${(x) => (x.editingError ? "true" : "false")}"
        aria-errormessage="${(x) => (x.editingError ? x.editingErrorId : null)}"
        :value="${(x) => x.editValue}"
    >
        ${repeat((x) => x.editorOptions, html `
                <option value="${(x) => x.value}">${(x) => x.label}</option>
            `)}
    </select>
`;