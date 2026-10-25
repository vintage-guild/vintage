import type { FASTElementDefinition } from "../components/fast-definitions.js";
import type { ElementViewTemplate } from "../templating/template.js";
/**
 * Publishes a concrete template for a definition.
 * @internal
 */
export interface TemplatePublisher {
    publishTemplate(definition: FASTElementDefinition): ElementViewTemplate | Promise<ElementViewTemplate>;
}
/**
 * Coordinates declarative template publishers and FAST element definitions.
 * Requests are keyed by registry + element name so scoped registries can
 * resolve templates independently.
 * @internal
 */
export declare class DeclarativeTemplateBridge {
    private readonly buckets;
    requestTemplate(definition: FASTElementDefinition): Promise<ElementViewTemplate>;
    registerPublisher(registry: CustomElementRegistry, name: string | undefined, publisher: TemplatePublisher): void;
    unregisterPublisher(registry: CustomElementRegistry, name: string | undefined, publisher: TemplatePublisher): void;
    movePublisher(registry: CustomElementRegistry, previousName: string | undefined, nextName: string | undefined, publisher: TemplatePublisher): void;
    private getBucket;
    private processBucket;
    private resetPublisherRequests;
    private resolveRequest;
    private rejectRequest;
    private cleanupBucket;
}
/**
 * Shared template bridge storage for the current FAST runtime.
 * @internal
 */
export declare const declarativeTemplateBridge: DeclarativeTemplateBridge;
