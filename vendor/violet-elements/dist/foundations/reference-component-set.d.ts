export type ReferenceComponentDefinition = {
    id: string;
    title: string;
    status: "done" | "next" | "planned";
    shape: string;
    validates: string[];
    whyItMatters: string;
};
export declare const referenceComponentSet: ReferenceComponentDefinition[];