import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import commitlint from '../commitlint.config.mjs'

// The shape of .github/dependabot.yml, read as text like the workflows in ci-shape.test.mjs: the
// root has no YAML parser.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const config = read('../.github/dependabot.yml')
const workspace = read('../pnpm-workspace.yaml')

/** Each entry of `updates`, keyed by its ecosystem. */
const updates = Object.fromEntries(
  config
    .split('\n  - package-ecosystem: ')
    .slice(1)
    .map((entry) => [entry.split('\n')[0], entry]),
)

test('dependabot updates the dependencies, the actions, the images and the providers', () => {
  assert.deepEqual(Object.keys(updates).sort(), [
    'docker-compose',
    'github-actions',
    'npm',
    'opentofu',
  ])
})

test('every update waits as long as pnpm before proposing a version', () => {
  const minutes = Number(/^minimumReleaseAge: (\d+)$/m.exec(workspace)?.[1])
  assert.ok(minutes > 0)
  for (const [ecosystem, entry] of Object.entries(updates)) {
    assert.equal(
      Number(/\n {4}cooldown:\n {6}default-days: (\d+)\n/.exec(entry)?.[1]) * 24 * 60,
      minutes,
      ecosystem,
    )
  }
})

// A group whose pattern takes every dependency opens its pull request once one member is past its
// cooldown, carrying along the others that are not
test('no group takes every dependency', () => {
  assert.doesNotMatch(config, /^\s+- ['"]?\*['"]?$/m)
})

test('every update targets develop', () => {
  for (const [ecosystem, entry] of Object.entries(updates)) {
    assert.match(entry, /\n {4}target-branch: develop\n/, ecosystem)
  }
})

test("every commit message has a type and a scope commitlint's configuration takes", () => {
  const [, , types] = commitlint.rules['type-enum']
  const [, , scopes] = commitlint.rules['scope-enum']
  for (const [ecosystem, entry] of Object.entries(updates)) {
    const prefix = /\n {6}prefix: ['"]?(\w+)\((\w+)\)['"]?\n/.exec(entry)
    assert.ok(prefix, ecosystem)
    assert.ok(types.includes(prefix[1]), ecosystem)
    assert.ok(scopes.includes(prefix[2]), ecosystem)
    assert.doesNotMatch(entry, /\n {6}include: scope\n/, ecosystem)
  }
})

test('every directory an update reads exists', () => {
  for (const [ecosystem, entry] of Object.entries(updates)) {
    const directories = [
      ...entry.matchAll(/\n {4}directory: (\S+)/g),
      ...entry.matchAll(/\n {6}- (\/\S*)$/gm),
    ].map((match) => match[1].replace(/^['"]|['"]$/g, ''))
    assert.ok(directories.length > 0, ecosystem)
    for (const directory of directories) {
      // A glob reads every directory under its parent
      const path = directory.replace(/\/\*$/, '')
      assert.ok(existsSync(new URL(`..${path}`, import.meta.url)), `${ecosystem} ${directory}`)
    }
  }
})
