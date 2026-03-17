import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    include: [
      'apps/api/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
      'apps/web/app/**/*.test.tsx',
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['apps/web/src/**/*.test.tsx', 'jsdom'],
      ['apps/web/app/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'apps/api/src/**/*.ts',
        'apps/web/app/**/*.ts',
        'apps/web/app/**/*.tsx',
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
        'packages/shared/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'apps/web/src/styles/**',
        'apps/web/next-env.d.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
