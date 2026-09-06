import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  oxc: {
    // Next.js needs tsconfig `jsx: preserve`, but vitest must transpile
    // TSX that tsconfig option leaves untouched.
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
