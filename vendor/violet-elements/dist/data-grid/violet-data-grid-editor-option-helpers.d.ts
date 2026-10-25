import type { VioletDataGridEditorOption } from "./violet-data-grid";
export declare function filterEditorOptions(options: VioletDataGridEditorOption[], query: string): VioletDataGridEditorOption[];
export declare function optionForValue(options: VioletDataGridEditorOption[], value: string): VioletDataGridEditorOption | null;
export declare function displayOptionForValue(options: VioletDataGridEditorOption[], value: string): VioletDataGridEditorOption;
export declare function optionStyle(option: VioletDataGridEditorOption): string;
export declare function resolveOptionVisuals(option: VioletDataGridEditorOption): {
    background: string;
    foreground: string;
    borderColor: string;
};