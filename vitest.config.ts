import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Let stylesheets load as text, so the design-steps test can read them.
    css: true,
  },
});
