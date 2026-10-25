import { type TypeRegistry } from "../platform.js";
import type { FASTElementDefinition } from "./fast-definitions.js";
/**
 * The FAST custom element registry.
 * @public
 */
export interface FASTElementRegistry extends TypeRegistry<FASTElementDefinition> {
    /**
     * Resolves when a FAST element definition has been registered for the tag name.
     * @param name - The custom element tag name.
     * @param registry - The custom element registry to observe.
     */
    whenRegistered(name: string, registry?: CustomElementRegistry): Promise<FASTElementDefinition>;
}
/**
 * The FAST custom element registry.
 * @remarks
 * This registry stores FAST element definitions by constructor so consumers can
 * look up the `FASTElementDefinition` associated with an element type, instance,
 * or registered tag name.
 * @public
 */
export declare const fastElementRegistry: FASTElementRegistry;
