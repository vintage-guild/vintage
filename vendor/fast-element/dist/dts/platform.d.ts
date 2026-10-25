/**
 * The FAST messaging API for warnings and errors.
 * @public
 */
export declare const FAST: {
    /**
     * Sends a warning to the developer.
     * @param code - The warning code to send.
     * @param values - Values relevant for the warning message.
     */
    warn(_code: number, _values?: Record<string, any>): void;
    /**
     * Creates an error from a code.
     * @param code - The error code.
     * @param values - Values relevant for the error message.
     */
    error(code: number, _values?: Record<string, any>): Error;
    /**
     * Adds debug messages for errors and warnings.
     * @param messages - The message dictionary to add.
     */
    addMessages(messages: Record<number, string>): void;
};
/**
 * Gets the shared debug message lookup.
 * @internal
 */
export declare function getDebugMessageLookup(): Record<number, string>;
/**
 * A readonly, empty array.
 * @remarks
 * Typically returned by APIs that return arrays when there are
 * no actual items to return.
 * @public
 */
export declare const emptyArray: readonly never[];
/**
 * A type that can be registered with a `TypeRegistry`.
 * @public
 */
export interface TypeDefinition {
    /**
     * The registered type constructor.
     */
    type: Function;
}
/**
 * A registry that stores definitions by type.
 * @public
 */
export interface TypeRegistry<TDefinition extends TypeDefinition> {
    /**
     * Registers a type definition.
     * @param definition - The type definition to register.
     * @returns `true` when the definition was registered, otherwise `false`.
     */
    register(definition: TDefinition): boolean;
    /**
     * Gets a definition by type.
     * @param key - The type to retrieve the definition for.
     */
    getByType(key: Function): TDefinition | undefined;
    /**
     * Gets a definition by instance.
     * @param object - The instance to retrieve the definition for.
     */
    getForInstance(object: any): TDefinition | undefined;
}
/**
 * Do not change. Part of shared kernel contract.
 * @internal
 */
export declare function createTypeRegistry<TDefinition extends TypeDefinition>(): TypeRegistry<TDefinition>;
/**
 * Creates a function capable of locating metadata associated with a type.
 * @returns A metadata locator function.
 * @internal
 */
export declare function createMetadataLocator<TMetadata>(): (target: {}) => TMetadata[];
/**
 * Makes a type noop for JSON serialization.
 * @param type - The type to make noop for JSON serialization.
 * @internal
 */
export declare function makeSerializationNoop(type: {
    readonly prototype: any;
}): void;
