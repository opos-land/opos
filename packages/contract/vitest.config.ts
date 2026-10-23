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
  test: { include: ['src/**/*.test.ts'] },
})
