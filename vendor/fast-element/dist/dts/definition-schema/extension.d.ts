import { type FASTElementExtension } from "../components/fast-definitions.js";
/**
 * Extracts and stores the Agent Definition Schema for a FAST element.
 * @internal
 */
export declare const definitionSchemaExtension: FASTElementExtension;
/**
 * Enables automatic Definition Schema extraction for subsequently defined FAST elements.
 * Call this before element definitions are registered.
 * @returns A callback that disables automatic extraction.
 * @public
 */
export declare function enableDefinitionSchema(): () => void;
/**
 * Disables automatic Definition Schema extraction.
 * @public
 */
export declare function disableDefinitionSchema(): void;
