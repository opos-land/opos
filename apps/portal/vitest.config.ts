import { lingui } from '@lingui/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { devEnvDefaults } from './env.config.ts'

export default defineConfig({
  // Components and the shared messages of @opos/i18n are written with Lingui macros.
  plugins: [react(), lingui({ macroTransform: true })],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    // Unit tests sit next to the file they test.
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    env: devEnvDefaults(import.meta.dirname),
  },
})
