import { defineConfig, type LinguiConfig } from '@lingui/conf'
import { formatter } from '@lingui/format-po'
import { SOURCE_LOCALE, SUPPORTED_LOCALES } from './src/locales'

/** Shared by the lingui.config.ts of every package and application with a catalog. */
export const linguiConfig = (catalogs: NonNullable<LinguiConfig['catalogs']>) =>
  defineConfig({
    sourceLocale: SOURCE_LOCALE,
    locales: [...SUPPORTED_LOCALES],
    fallbackLocales: { default: SOURCE_LOCALE },
    catalogs,
    format: formatter({ lineNumbers: false }),
    compileNamespace: 'es',
  })
