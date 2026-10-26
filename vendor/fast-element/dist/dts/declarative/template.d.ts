import type { FASTElementTemplateResolver } from "../components/fast-definitions.js";
import type { Constructable } from "../interfaces.js";
/**
 * Returns a declarative template resolver that waits for the matching
 * `<f-template>` element and resolves it into a concrete `ViewTemplate`.
 *
 * @public
 */
export declare function declarativeTemplate<TType extends Constructable<HTMLElement> = Constructable<HTMLElement>>(): FASTElementTemplateResolver<TType>;
