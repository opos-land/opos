import { release } from 'node:os'
import { fileURLToPath } from 'node:url'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // @opos/i18n/errors is written with Lingui macros; they compile with that package's config.
  plugins: [
    lingui({
      macroTransform: true,
      configPath: fileURLToPath(import.meta.resolve('@opos/i18n/lingui.config')),
    }),
  ],
  test: {
    // On WSL four workers at most: the stack shares its VM, whose clock steps under load.
    // VITEST_MAX_WORKERS still sets any count.
    maxWorkers: /microsoft/i.test(release()) ? 4 : undefined,
    include: ['src/**/*.test.ts'],
  },
})
