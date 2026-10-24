import { defineConfig } from 'vitest/config'

// Unit tests of the fixtures; the scenarios in specs/ run under Playwright (PLAN.md 15).
export default defineConfig({
  test: {
    include: ['fixtures/**/*.test.ts'],
  },
})
