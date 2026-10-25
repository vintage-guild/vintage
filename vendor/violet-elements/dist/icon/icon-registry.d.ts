export type VioletIconSource = {
    id: string;
    title: string;
    license: string;
    attribution: string;
    homepage: string;
    notes: string;
};
export type VioletIconDefinition = {
    name: string;
    svg: string;
    sourceId: string;
    originalFile: string;
};
export declare function registerVioletIcon(definition: VioletIconDefinition): VioletIconDefinition;
export declare function registerVioletIcons(definitions: readonly VioletIconDefinition[]): readonly VioletIconDefinition[];
export declare function resolveVioletIcon(name: string): VioletIconDefinition | null;
export declare function hasVioletIcon(name: string): boolean;
export declare function listRegisteredVioletIcons(): string[];
export declare function clearVioletIconRegistryForTesting(): void;