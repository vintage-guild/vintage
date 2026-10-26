import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@vintage/web',
    environment: 'happy-dom',
  },
});
