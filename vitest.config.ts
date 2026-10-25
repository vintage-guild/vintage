import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['libs/*', 'packages/*', 'modules/*', 'apps/*'],
    passWithNoTests: false,
  },
});
