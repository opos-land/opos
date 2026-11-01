import { join } from 'node:path'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'
import { react } from './react.js'

const root = join(import.meta.dirname, 'fixtures', 'feature-app')

// Type information plays no part in the rules under test, so the fixture needs no React types.
// An import that does not resolve is not checked, so the import of a workspace package must also
// prove that it resolves.
const lint = (options) =>
  new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      ...react(root, options),
      tseslint.configs.disableTypeChecked,
      {
        files: ['src/features/beta/into-package.ts'],
        rules: { 'import-x/no-unresolved': 'error' },
      },
    ],
  })

const eslint = lint({
  legacyAuth: ['src/shared/lib/legacy-auth.ts', 'src/shared/lib/legacy-client.ts'],
})

async function ruleIds(file, linter = eslint) {
  const [result] = await linter.lintFiles([join(root, 'src', file)])
  return result.messages.map((message) => message.ruleId)
}

describe('react preset', () => {
  it('lets a feature import another feature through its index.ts and shared/', async () => {
    expect(await ruleIds('features/beta/through-index.ts')).toEqual([])
  })

  it('lets a feature import a workspace package', async () => {
    expect(await ruleIds('features/beta/into-package.ts')).toEqual([])
  })

  it("forbids a feature to import another feature's internals", async () => {
    expect(await ruleIds('features/beta/into-internals.ts')).toEqual([
      'import-x/no-restricted-paths',
    ])
  })

  it('forbids shared/ to import a feature', async () => {
    expect(await ruleIds('shared/lib/into-feature.ts')).toEqual(['import-x/no-restricted-paths'])
  })

  it('lets app/ import anything', async () => {
    expect(await ruleIds('app/router.ts')).toEqual([])
  })

  it('forbids shared/ to import app/', async () => {
    expect(await ruleIds('shared/lib/into-app.ts')).toEqual(['import-x/no-restricted-paths'])
  })

  it('forbids a feature to import app/', async () => {
    expect(await ruleIds('features/beta/into-app.ts')).toEqual(['import-x/no-restricted-paths'])
  })

  it('applies the accessibility rules to JSX', async () => {
    expect(await ruleIds('features/beta/components/avatar.tsx')).toEqual(['jsx-a11y/alt-text'])
  })

  it('applies the React rules to JSX', async () => {
    expect(await ruleIds('features/beta/components/name-list.tsx')).toEqual(['react/jsx-key'])
  })

  it('forbids an import of a Supabase package', async () => {
    expect(await ruleIds('features/beta/into-supabase.ts')).toEqual(['no-restricted-imports'])
  })

  it('forbids it in a JavaScript file and as a dynamic import as well', async () => {
    expect(await ruleIds('features/beta/into-supabase-js.js')).toEqual(['no-restricted-imports'])
    expect(await ruleIds('features/beta/into-supabase-dynamic.ts')).toEqual([
      'no-restricted-syntax',
    ])
  })

  it('lets the listed files import the auth-js client and no other Supabase package', async () => {
    expect(await ruleIds('shared/lib/legacy-client.ts')).toEqual(['no-restricted-imports'])
  })

  it('lets only the listed files import a Supabase package until sign-in moves to the API', async () => {
    expect(await ruleIds('shared/lib/legacy-auth.ts')).toEqual([])
    expect(await ruleIds('shared/lib/legacy-auth.ts', lint())).toEqual(['no-restricted-imports'])
  })

  it('applies the rules of hooks', async () => {
    expect(await ruleIds('features/beta/hooks/use-flag.ts')).toEqual(['react-hooks/rules-of-hooks'])
  })
})
