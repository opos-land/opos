import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fixupConfigRules } from '@eslint/compat'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { base } from './index.js'

const sourceFiles = ['**/*.{ts,tsx}']
const scriptFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}']

/** Refuses an import of a Supabase package, static or dynamic, but of `except` when given. */
function supabaseImports(except) {
  const message = 'The API is the only backend: sign-in goes through its auth endpoints.'
  const group = except ? ['@supabase/*', `!${except}`] : ['@supabase/*']
  const name = except ? `(?!${except.replace('@supabase/', '')}$)` : ''
  return {
    'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
    'no-restricted-syntax': [
      'error',
      { selector: `ImportExpression[source.value=/^@supabase\\u002F${name}/]`, message },
    ],
  }
}

/**
 * The import rules of the feature-based layout (PLAN.md 3.2), for the application whose root is
 * `root`: a feature sees another feature only through its `index.ts`, `shared/` never imports a
 * feature, `app/` imports anything and nothing imports `app/`. Features are read from
 * `src/features` when the config loads.
 */
export function featureBoundaries(root) {
  const featuresDir = join(root, 'src', 'features')
  const features = existsSync(featuresDir)
    ? readdirSync(featuresDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : []

  const zones = [
    {
      target: './src/shared',
      from: './src/features',
      message: 'shared/ never imports a feature.',
    },
    {
      target: './src/shared',
      from: './src/app',
      message: 'app/ is the top layer; nothing imports it.',
    },
    {
      target: './src/features',
      from: './src/app',
      message: 'app/ is the top layer; nothing imports it.',
    },
    ...features.flatMap((feature) =>
      features
        .filter((other) => other !== feature)
        .map((other) => ({
          target: `./src/features/${feature}`,
          from: `./src/features/${other}`,
          except: ['./index.ts'],
          message: `Import features/${other} through its index.ts.`,
        })),
    ),
  ]

  return tseslint.config({
    files: sourceFiles,
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: join(root, 'tsconfig.json') }),
      ],
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { basePath: root, zones }],
    },
  })
}

/**
 * A browser application built with React: the panel and the portal. Neither imports a Supabase
 * package, since the API is its only backend (PLAN.md 3.2); `legacyAuth` lists the files that
 * still import the `@supabase/auth-js` client until sign-in moves to the API, and nothing joins
 * that list.
 */
export function react(root, { legacyAuth = [] } = {}) {
  return tseslint.config(
    base,
    {
      languageOptions: { globals: globals.browser },
    },
    {
      files: sourceFiles,
      extends: [
        // eslint-plugin-react calls context methods ESLint 10 removed, and eslint-plugin-jsx-a11y
        // declares no ESLint 10 support; fixupConfigRules restores those methods for both.
        fixupConfigRules([
          reactPlugin.configs.flat.recommended,
          reactPlugin.configs.flat['jsx-runtime'],
          jsxA11y.flatConfigs.recommended,
        ]),
        reactHooks.configs.flat.recommended,
      ],
      settings: { react: { version: 'detect' } },
      rules: {
        // Types replace prop-types.
        'react/prop-types': 'off',
      },
    },
    { files: scriptFiles, rules: supabaseImports() },
    legacyAuth.length > 0 ? { files: legacyAuth, rules: supabaseImports('@supabase/auth-js') } : {},
    featureBoundaries(root),
  )
}
