var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getDefinitionSchemaTransforms } from "../components/definition-schema-transforms.js";
import { Schema } from "../components/schema.js";
import { FAST } from "../platform.js";
import { Message } from "./interfaces.js";
import { ensureDeclarativeRuntime } from "./runtime.js";
import { declarativeTemplateBridge } from "./template-bridge.js";
import { TemplateParser } from "./template-parser.js";
import { escapeBracesInCodeElements, transformInnerHTML } from "./utilities.js";
const templateElementName = "f-template";
const ensuredTemplateElements = new WeakMap();
function isTemplateElementConstructor(value) {
    return value === FTemplateElement || (value === null || value === void 0 ? void 0 : value.prototype) instanceof FTemplateElement;
}
function ensureTemplateElementDefined(registry) {
    return __awaiter(this, void 0, void 0, function* () {
        const ensured = ensuredTemplateElements.get(registry);
        if (ensured) {
            return ensured;
        }
        const definitionPromise = Promise.resolve().then(() => {
            const existing = registry.get(templateElementName);
            if (existing !== void 0) {
                if (isTemplateElementConstructor(existing)) {
                    return;
                }
                throw new Error("The <f-template> element is already defined in this registry by a different implementation.");
            }
            const RegisteredTemplateElement = class extends FTemplateElement {
                get registry() {
                    return registry;
                }
            };
            registry.define(templateElementName, RegisteredTemplateElement);
        });
        const pending = definitionPromise.catch(error => {
            ensuredTemplateElements.delete(registry);
            throw error;
        });
        ensuredTemplateElements.set(registry, pending);
        return pending;
    });
}
/**
 * Returns a declarative template resolver that waits for the matching
 * `<f-template>` element and resolves it into a concrete `ViewTemplate`.
 *
 * @public
 */
export function declarativeTemplate() {
    ensureDeclarativeRuntime();
    return (definition) => __awaiter(this, void 0, void 0, function* () {
        yield ensureTemplateElementDefined(definition.registry);
        return declarativeTemplateBridge.requestTemplate(definition);
    });
}
class FTemplateElement extends HTMLElement {
    get registry() {
        return customElements;
    }
    get name() {
        var _a;
        return (_a = this.getAttribute("name")) !== null && _a !== void 0 ? _a : undefined;
    }
    set name(value) {
        if (value == null) {
            this.removeAttribute("name");
            return;
        }
        this.setAttribute("name", value);
    }
    connectedCallback() {
        declarativeTemplateBridge.registerPublisher(this.registry, this.name, this);
    }
    disconnectedCallback() {
        declarativeTemplateBridge.unregisterPublisher(this.registry, this.name, this);
    }
    attributeChangedCallback(attributeName, previousName, nextName) {
        if (attributeName !== "name" || !this.isConnected || previousName === nextName) {
            return;
        }
        declarativeTemplateBridge.movePublisher(this.registry, previousName !== null && previousName !== void 0 ? previousName : undefined, nextName !== null && nextName !== void 0 ? nextName : undefined, this);
    }
    publishTemplate(definition) {
        var _a;
        ensureDeclarativeRuntime();
        const name = definition.name;
        const templates = Array.from(this.children).filter((child) => child.tagName === "TEMPLATE");
        if (templates.length > 1) {
            throw FAST.error(Message.moreThanOneTemplateProvided, {
                name,
            });
        }
        if (templates.length === 0) {
            throw FAST.error(Message.noTemplateProvided, { name });
        }
        const schema = (_a = definition.schema) !== null && _a !== void 0 ? _a : new Schema(name);
        definition.schema = schema;
        const innerHTML = transformInnerHTML(escapeBracesInCodeElements(this.innerHTML));
        const parser = new TemplateParser();
        const { strings, values } = parser.parse(innerHTML, schema);
        for (const transform of getDefinitionSchemaTransforms(definition)) {
            transform({ definition, schema });
        }
        return parser.createTemplate(strings, values);
    }
}
FTemplateElement.observedAttributes = ["name"];
