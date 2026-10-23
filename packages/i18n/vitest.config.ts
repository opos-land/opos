import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  test: { include: ['test/**/*.test.ts'] },
})
