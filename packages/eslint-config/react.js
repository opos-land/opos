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

/**
 * The import rules of the feature-based layout (PLAN.md 3.2), for the application whose root is
 * `root`: a feature sees another feature only through its `index.ts`, `shared/` never imports a
 * feature, `app/` imports anything. Features are read from `src/features` when the config loads.
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

/** A browser application built with React: the panel and the portal. */
export function react(root) {
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
    featureBoundaries(root),
  )
}
