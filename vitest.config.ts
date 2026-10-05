import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      { test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } },
    ],
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/test/integration/**'],
  },
})
