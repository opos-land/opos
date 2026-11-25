import { lingui } from '@lingui/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { devEnvDefaults, devServerAddress } from './env.config.ts'
import { headInDev } from './src/server/dev.ts'

export default defineConfig(({ command, mode }) => {
  const root = import.meta.dirname
  // OPOS_* sets the dev server only; the bundle still gets VITE_* alone (envPrefix).
  const env = loadEnv(mode, root, ['VITE_', 'OPOS_'])
  const defaults = command === 'serve' ? devEnvDefaults(root) : {}
  const missing = Object.entries(defaults).filter(([key]) => env[key] === undefined)
  const address = devServerAddress(env)
  // The dev server fills a page's head as a deployment's server does, under the address the
  // browser opens the portal at and from the API the portal itself calls.
  const apiUrl = env.VITE_API_URL ?? defaults.VITE_API_URL
  const head =
    command === 'serve' && apiUrl
      ? [headInDev({ origin: `http://opos.localhost:${address.port}`, apiUrl })]
      : []

  return {
    plugins: [react(), lingui({ macroTransform: true }), tailwindcss(), ...head],
    // `@/` from tsconfig.json: the import alias of the shadcn/ui components.
    resolve: { tsconfigPaths: true },
    define: Object.fromEntries(
      missing.map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    server: { ...address, strictPort: true },
    build: { sourcemap: true },
    // The server beside the portal is one file with everything it imports in it: its image holds
    // Node and no installed dependency (`vite build --ssr`).
    ssr: command === 'build' ? { noExternal: true } : {},
  }
})
