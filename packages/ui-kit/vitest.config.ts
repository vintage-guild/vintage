import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@vintage/ui-kit',
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
