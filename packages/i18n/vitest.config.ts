import { release } from 'node:os'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [lingui({ macroTransform: true })],
  test: {
    // On WSL four workers at most: the stack shares its VM, whose clock steps under load.
    // VITEST_MAX_WORKERS still sets any count.
    maxWorkers: /microsoft/i.test(release()) ? 4 : undefined,
    // Unit tests sit next to the file they test.
    include: ['src/**/*.test.ts'],
  },
})
