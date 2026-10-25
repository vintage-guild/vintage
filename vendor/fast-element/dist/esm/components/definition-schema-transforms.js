const definitionSchemaTransformsKey = Symbol("definitionSchemaTransforms");
let schemaTransformOrder = 0;
export function setDefinitionSchemaTransform(definition, key, transform, priority) {
    var _a;
    const target = definition;
    const transforms = ((_a = target[definitionSchemaTransformsKey]) !== null && _a !== void 0 ? _a : (target[definitionSchemaTransformsKey] = []));
    const existingIndex = transforms.findIndex(record => record.key === key);
    if (existingIndex !== -1) {
        transforms.splice(existingIndex, 1);
    }
    transforms.push({
        key,
        transform,
        order: schemaTransformOrder++,
        priority,
    });
    transforms.sort((a, b) => a.priority - b.priority || a.order - b.order);
}
export function getDefinitionSchemaTransforms(definition) {
    var _a;
    const transforms = definition === null || definition === void 0 ? void 0 : definition[definitionSchemaTransformsKey];
    return (_a = transforms === null || transforms === void 0 ? void 0 : transforms.map(record => record.transform)) !== null && _a !== void 0 ? _a : [];
}
