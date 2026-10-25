/**
 * Scoped Custom Element Registries support for FAST-AF.
 *
 * @remarks
 * This module provides utilities for working with Scoped Custom Element Registries,
 * enabling isolated component definitions within shadow roots. This solves namespace
 * collisions for micro-frontends and design system versioning.
 *
 * @example Using ScopedRegistryMixin (recommended)
 * ```typescript
 * import { FASTElement, html } from '@lushly-dev/fast-element';
 * import { ScopedRegistryMixin } from '@lushly-dev/fast-element/scoped.js';
 *
 * class MyButton extends FASTElement {}
 *
 * class MyCard extends ScopedRegistryMixin(FASTElement) {
 *   static elementDefinitions = {
 *     'my-button': MyButton,
 *   };
 * }
 *
 * MyCard.define({
 *   name: 'my-card',
 *   template: html`<my-button>Click me</my-button>`,
 *   shadowOptions: MyCard.getShadowOptions(),
 * });
 * ```
 *
 * @example Using createRegistry directly
 * ```typescript
 * import {
 *   createRegistry,
 *   createRegistryAsync,
 *   supportsScopedRegistries,
 *   ensureScopedRegistrySupport,
 * } from '@lushly-dev/fast-element/scoped.js';
 *
 * // Check support
 * if (supportsScopedRegistries()) {
 *   const registry = createRegistry([
 *     [MyButton, 'my-button'],
 *     [MyInput, 'my-input'],
 *   ]);
 *
 *   element.attachShadow({
 *     mode: 'open',
 *     customElementRegistry: registry,
 *   });
 * }
 *
 * // Or use async version with automatic polyfill
 * const registry = await createRegistryAsync([
 *   [MyButton, 'my-button'],
 * ]);
 * ```
 *
 * @packageDocumentation
 */
export type { ScopedShadowRootInit, ElementDefinition, CreateRegistryOptions, } from "./types.js";
export { supportsScopedRegistries, ensureScopedRegistrySupport } from "./detection.js";
export { createRegistry, createRegistryAsync } from "./registry.js";
export { ScopedRegistryMixin } from "./mixin.js";
export type { ElementDefinitionMap, ScopedRegistryHost, ScopedRegistryHostConstructor, } from "./mixin.js";
