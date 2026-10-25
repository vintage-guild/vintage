import { defineProject } from 'vitest/config';

// Vitest blanks CSS imports by default; the outputs test reads the generated
// stylesheets with `?raw`, so let them through untouched.
export default defineProject({
  test: {
    name: '@vintage/design-tokens',
    css: { include: [/generated[\\/]css[\\/].+\.css/] },
  },
});
