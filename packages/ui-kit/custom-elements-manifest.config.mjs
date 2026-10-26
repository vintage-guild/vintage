// Custom Elements Manifest for @vintage/ui-kit (PLAN §3.9). `pnpm --filter @vintage/ui-kit build`
// writes dist/custom-elements.json; scripts/check-cem.mjs then fails if an element is missing.

/** `@command('id', { label, … })` → { id, method, label, … }, or null for other decorators. */
function readCommand(ts, decorator, method) {
  const call = decorator.expression;
  if (!ts.isCallExpression(call) || call.expression.getText() !== 'command') return null;
  const [id, options] = call.arguments;
  if (!id || !ts.isStringLiteral(id)) return null;
  const entry = { id: id.text, method: method.name.getText() };
  const props = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
  for (const prop of props) {
    if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.initializer)) {
      entry[prop.name.getText()] = prop.initializer.text;
    }
  }
  return entry;
}

/** Records FAST-AF `@command` methods on their class declaration as `commands`. */
function commandsPlugin() {
  return {
    name: 'vintage-commands',
    analyzePhase({ ts, node, moduleDoc }) {
      if (!ts.isMethodDeclaration(node) || !ts.isClassDeclaration(node.parent)) return;
      const declaration = moduleDoc.declarations?.find((d) => d.name === node.parent.name?.text);
      if (!declaration) return;
      for (const decorator of ts.getDecorators?.(node) ?? []) {
        const entry = readCommand(ts, decorator, node);
        if (entry) declaration.commands = [...(declaration.commands ?? []), entry];
      }
    },
  };
}

export default {
  globs: ['src/elements/*.ts'],
  exclude: ['src/**/*.test.ts'],
  outdir: 'dist',
  fast: true,
  plugins: [commandsPlugin()],
};
