type TokenUsage = {
    intent: string;
    allowedIn: string[];
    avoid: string[];
    whyDistinct: string;
};
type TokenMetadata = {
    category: string;
    tier: string;
    status: string;
    description: string;
    owner?: string;
    platforms?: string[];
    cssProperty?: string;
    tags?: string[];
};
type TokenReferenceValue = {
    ref: string;
    transform?: string;
};
export type VioletTokenValue = string | number | TokenReferenceValue;
export type VioletRegistryToken = {
    id: string;
    value: VioletTokenValue;
    metadata: TokenMetadata;
    usage: TokenUsage;
};
export type VioletTokenRegistry = {
    registryVersion: string;
    package: string;
    description: string;
    tokens: VioletRegistryToken[];
};
export type VioletTokenGroup = {
    id: string;
    title: string;
    description: string;
    tokens: VioletRegistryToken[];
};
export declare const violetTokenRegistry: VioletTokenRegistry;
export declare const violetTokenGroups: VioletTokenGroup[];
export declare function tokenIdToCssVar(tokenId: string): string;
export declare function tokenValueToCssValue(value: VioletTokenValue): string;
export declare function buildRegistryCssVars(tokens: VioletRegistryToken[]): string;
export declare function isColorToken(token: VioletRegistryToken): boolean;
export {};