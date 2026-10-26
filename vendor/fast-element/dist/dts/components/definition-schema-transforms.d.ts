import type { FASTElementDefinition } from "../components/fast-definitions.js";
import type { Schema } from "./schema.js";
export interface DeclarativeSchemaTransformContext {
    definition: FASTElementDefinition;
    schema: Schema;
}
export type DeclarativeSchemaTransform = (context: DeclarativeSchemaTransformContext) => void;
export declare function setDefinitionSchemaTransform(definition: FASTElementDefinition, key: string, transform: DeclarativeSchemaTransform, priority: number): void;
export declare function getDefinitionSchemaTransforms(definition?: FASTElementDefinition): readonly DeclarativeSchemaTransform[];
