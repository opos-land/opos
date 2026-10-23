import { defineConfig, type LinguiConfig } from '@lingui/conf'
import { formatter } from '@lingui/format-po'
import { SOURCE_LOCALE, SUPPORTED_LOCALES } from './src/locales'

// Unit tests sit next to the code they test and never contribute messages.
const TESTS = ['**/*.test.ts', '**/*.test.tsx']

/** Shared by the lingui.config.ts of every package and application with a catalog. */
export const linguiConfig = (catalogs: NonNullable<LinguiConfig['catalogs']>) =>
  defineConfig({
    sourceLocale: SOURCE_LOCALE,
    locales: [...SUPPORTED_LOCALES],
    fallbackLocales: { default: SOURCE_LOCALE },
    catalogs: catalogs.map((catalog) => ({
      ...catalog,
      exclude: [...(catalog.exclude ?? []), ...TESTS],
    })),
    format: formatter({ lineNumbers: false }),
    compileNamespace: 'es',
  })
