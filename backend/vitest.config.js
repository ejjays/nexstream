import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    reporters: ['default', 'junit'],
    outputFile: './test-results.xml',
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
        autoUpdate: false
      },
      exclude: [
        'tests/**',
        'eslint.config.js',
        'vitest.config.js'
      ]
    },
  },
});
