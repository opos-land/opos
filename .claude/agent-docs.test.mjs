import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

const agentFiles = readdirSync(join(root, '.claude/agents'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => `.claude/agents/${name}`)
const documents = ['AGENTS.md', ...agentFiles]

// A backticked string is a repository path when it has no space, glob character, placeholder or
// command syntax, holds a slash and starts with a top-level directory of the repository.
// Everything else (a command, a glob, `@opos/e2e`, a URL) is not a path. An anchor and a
// trailing slash are dropped. Existence is checked with existsSync alone; no file is opened.
const roots = ['apps', 'packages', 'docs', 'scripts', 'infra', 'supabase', 'e2e', '.claude', '.github']
const isPath = (text) =>
  !/[\s*{}<>$=:@|]/.test(text) && text.includes('/') && roots.includes(text.split('/')[0])

const citedPaths = (file) =>
  [...read(file).matchAll(/`([^`\n]+)`/g)]
    .map(([, text]) => text.replace(/#.*$/, '').replace(/\/$/, ''))
    .filter(isPath)

// Paths the documents cite that are not built yet.
const absentOnPurpose = new Set(['packages/db/src/scripts/roles.ts'])

test('every repository path AGENTS.md and the agent files cite exists', () => {
  const missing = new Set()
  for (const file of documents) {
    for (const path of citedPaths(file)) {
      if (!existsSync(join(root, path)) && !absentOnPurpose.has(path)) {
        missing.add(`${file}: ${path}`)
      }
    }
  }
  assert.deepEqual([...missing], [])
})

test('every path absent on purpose is still absent and still cited', () => {
  const cited = new Set(documents.flatMap(citedPaths))
  for (const path of absentOnPurpose) {
    assert.equal(existsSync(join(root, path)), false, `${path} exists now: drop it from the list`)
    assert.ok(cited.has(path), `${path} is no longer cited: drop it from the list`)
  }
})

test('the area names of AGENTS.md equal those of tests-first.mjs', () => {
  const script = read('scripts/tests-first.mjs')
  const fromScript = new Set([
    ...[...script.matchAll(/\bname: '([\w-]+)',/g)].map(([, name]) => name),
    ...[...script.matchAll(/packageArea\('([\w-]+)'/g)].map(([, name]) => name),
  ])
  const section = read('AGENTS.md').split('### Tests first')[1].split('Code is a script')[0]
  const fromDocument = new Set(
    section
      .split('\n')
      .filter((line) => /^\| `/.test(line))
      .flatMap((line) => [...line.split('|')[1].matchAll(/`([\w-]+)`/g)].map(([, name]) => name)),
  )
  assert.ok(fromScript.size > 5)
  assert.deepEqual([...fromDocument].sort(), [...fromScript].sort())
})

test('settings deny the real .env files and leave templates readable', () => {
  const { deny } = JSON.parse(read('.claude/settings.json')).permissions
  assert.deepEqual(deny, [
    'Read(./apps/*/.env)',
    'Read(./packages/*/.env)',
    'Read(./supabase/.env)',
    'Read(./supabase/signing_keys.json)',
  ])
  assert.ok(
    deny.every((rule) => !rule.includes('.env.')),
    'a template such as .env.example stays readable',
  )
})

test('settings run the migration reminder after an edit or a write', () => {
  const entries = JSON.parse(read('.claude/settings.json')).hooks.PostToolUse
  const entry = entries.find(({ matcher }) => matcher === 'Edit|Write')
  assert.ok(entry)
  assert.match(entry.hooks[0].command, /\.claude\/hooks\/migration-reminder\.mjs/)
})
