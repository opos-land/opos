import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  // Unit tests sit next to the file they test (PLAN.md 15).
  test: { include: ['src/**/*.test.ts'] },
})
