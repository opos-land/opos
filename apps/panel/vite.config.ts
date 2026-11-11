import { lingui } from '@lingui/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { devEnvDefaults, devServerAddress } from './env.config.ts'

export default defineConfig(({ command, mode }) => {
  const root = import.meta.dirname
  // OPOS_* sets the dev server only; the bundle still gets VITE_* alone (envPrefix).
  const env = loadEnv(mode, root, ['VITE_', 'OPOS_'])
  const defaults = command === 'serve' ? devEnvDefaults(root) : {}
  const missing = Object.entries(defaults).filter(([key]) => env[key] === undefined)

  return {
    plugins: [react(), lingui({ macroTransform: true }), tailwindcss()],
    // `@/` from tsconfig.json: the import alias of the shadcn/ui components.
    resolve: { tsconfigPaths: true },
    define: Object.fromEntries(
      missing.map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    server: { ...devServerAddress(env), strictPort: true },
    build: { sourcemap: true },
  }
})
