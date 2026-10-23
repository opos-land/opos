import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export const base = tseslint.config(
  // Compiled Lingui catalogs are build output.
  { ignores: ['dist/**', 'coverage/**', '**/locales/*.mjs'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)

export const node = tseslint.config(base, {
  languageOptions: { globals: globals.node },
})

export const nest = tseslint.config(node, {
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
  },
})
