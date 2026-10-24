import { lingui } from '@lingui/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { devEnvDefaults } from './env.config.ts'

export default defineConfig(({ command, mode }) => {
  const root = import.meta.dirname
  const env = loadEnv(mode, root, 'VITE_')
  const defaults = command === 'serve' ? devEnvDefaults(root) : {}
  const missing = Object.entries(defaults).filter(([key]) => env[key] === undefined)

  return {
    plugins: [react(), lingui({ macroTransform: true }), tailwindcss()],
    define: Object.fromEntries(
      missing.map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    // The portal's dev address (PLAN.md 12); OPOS_PORTAL_PORT moves it.
    server: {
      host: 'opos.localhost',
      port: Number(process.env.OPOS_PORTAL_PORT ?? 5174),
      strictPort: true,
    },
    build: { sourcemap: true },
  }
})
