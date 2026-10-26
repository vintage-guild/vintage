/**
 * Custom Elements Manifest 2.1.0 root structure.
 * @public
 */
export interface CustomElementsManifest {
    schemaVersion: "2.1.0";
    modules: ManifestModule[];
}
/**
 * A JavaScript module containing custom element declarations.
 * @public
 */
export interface ManifestModule {
    kind: "javascript-module";
    path: string;
    declarations: ManifestDeclaration[];
}
/**
 * A custom element class declaration.
 * @public
 */
export interface ManifestDeclaration {
    kind: "class";
    customElement: true;
    name: string;
    tagName: string;
    description?: string;
    members: Array<{
        kind: "field";
        name: string;
        type: {
            text: string;
        };
    }>;
    events: Array<{
        name: string;
        type: {
            text: string;
        };
    }>;
    slots: Array<{
        name: string;
        description?: string;
    }>;
    cssProperties: Array<{
        name: string;
        default?: string;
    }>;
}
/**
 * Converts a kebab-case string to PascalCase.
 * @param str - The kebab-case string to convert.
 * @returns The PascalCase version of the string.
 * @example
 * toPascalCase('my-button') // 'MyButton'
 * toPascalCase('my-cool-element') // 'MyCoolElement'
 * @public
 */
export declare function toPascalCase(str: string): string;
/**
 * Generates a Custom Elements Manifest (CEM 2.1.0) from registered schemas.
 *
 * @param registry - The custom element registry to export from (defaults to global customElements).
 * @returns A Custom Elements Manifest object conforming to CEM 2.1.0 schema.
 *
 * @remarks
 * The manifest groups each component into its own module with a synthesized path
 * based on the tag name (e.g., `my-button.js`). This is suitable for documentation
 * and tooling purposes but may not reflect actual file paths.
 *
 * @example
 * ```typescript
 * const manifest = toCustomElementsManifest();
 * console.log(JSON.stringify(manifest, null, 2));
 * ```
 * @public
 */
export declare function toCustomElementsManifest(registry?: CustomElementRegistry): CustomElementsManifest;
