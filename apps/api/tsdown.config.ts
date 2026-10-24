import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from '@lingui/conf'
import { mapMacroOptions, transform } from '@lingui/native-tools'
import { defineConfig, type Rolldown } from 'tsdown'

/**
 * Compiles the Lingui macros of the inlined @opos/i18n entry points (PLAN.md 6) with the config of
 * that package, keeping only message ids: the compiled catalogs carry the text.
 */
function linguiMacros(): Rolldown.Plugin {
  const config = getConfig({
    configPath: fileURLToPath(import.meta.resolve('@opos/i18n/lingui.config')),
  })
  return {
    name: 'lingui-macros',
    transform: {
      filter: {
        id: /\.[cm]?[jt]s$/,
        code: /from ['"]@lingui\/(?:core|react)\/macro['"]/,
      },
      async handler(code, id) {
        const result = await transform(code, basename(id), {
          macro: mapMacroOptions(config, { descriptorFields: 'id-only' }),
        })
        return { code: result.code, map: result.map }
      },
    },
  }
}

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  fixedExtension: false,
  deps: { alwaysBundle: [/^@opos\//] },
  plugins: [linguiMacros()],
})
