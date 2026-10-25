// Vite/Vitest `?raw` imports: the file's text as a string. Used by tests to compare the
// committed generated files with a fresh build without importing node:fs.
declare module '*?raw' {
  const content: string;
  export default content;
}
