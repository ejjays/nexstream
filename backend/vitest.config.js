import { defineConfig } from 'vitest/config';
import path from 'path';

const baseExcludes = ['**/node_modules/**', '**/dist/**'];
const includeManual = process.env.VITEST_INCLUDE_MANUAL === '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    reporters: ['default', 'junit'],
    outputFile: './test-results.xml',
    exclude: includeManual ? baseExcludes : [...baseExcludes, 'tests/manual/**'],
    // avoid resource contention in android
    poolOptions: {
      forks: {
        singleFork: false,
      },
      threads: {
        singleThread: false,
      },
    },
    sequence: {
      concurrent: false,
    },
    fileParallelism: false,
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 35,
        statements: 40,
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
