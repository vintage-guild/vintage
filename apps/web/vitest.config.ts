import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@vintage/web',
    environment: 'happy-dom',
    // ElementInternals for violet-elements, which happy-dom lacks (ui-kit uses the same).
    setupFiles: ['@vintage/ui-kit/test-setup'],
  },
});
