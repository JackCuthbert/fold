import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/test/integration/**'],
  },
})
