// Vite/Vitest `import.meta.glob`: tests load every committed fixture without importing node:fs.
interface ImportMeta {
  glob(
    pattern: string,
    options: { eager: true; query: '?raw'; import: 'default' },
  ): Record<string, string>;
}
