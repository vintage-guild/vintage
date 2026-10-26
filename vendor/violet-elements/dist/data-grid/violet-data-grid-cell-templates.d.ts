interface VioletDataGridCellTemplateModel {
    active: boolean;
    align: "start" | "center" | "end";
    columnId: string;
    columnLabel: string;
    editValue: string;
    editable: boolean;
    editor: "text" | "number" | "checkbox" | "select" | "custom";
    editing: boolean;
    editingError: string;
    editingErrorId: string;
    editorOptions: Array<{
        label: string;
        value: string;
    }>;
    fillPreview: boolean;
    rawValue: unknown;
    rowId: string;
    rowLabel: string;
    selected: boolean;
    text: string;
}
export declare const defaultCellContentTemplate: import("@lushly-dev/fast-element").ViewTemplate<VioletDataGridCellTemplateModel, any>;
export declare const inputCellEditorTemplate: import("@lushly-dev/fast-element").ViewTemplate<VioletDataGridCellTemplateModel, any>;
export declare const selectCellEditorTemplate: import("@lushly-dev/fast-element").ViewTemplate<VioletDataGridCellTemplateModel, any>;
export {};