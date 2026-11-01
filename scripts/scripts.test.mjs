// The coverage gate of pnpm test:scripts measures only the scripts a test loads, so every root
// script has a test beside it that imports it.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'node:test'

it('gives every root script a test beside it that imports it', () => {
  const scripts = readdirSync(import.meta.dirname).filter(
    (name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'),
  )
  assert.notEqual(scripts.length, 0)
  for (const script of scripts) {
    const test = join(import.meta.dirname, script.replace(/\.mjs$/, '.test.mjs'))
    assert.ok(existsSync(test), `${script} has no test beside it`)
    assert.match(readFileSync(test, 'utf8'), new RegExp(`from '\\./${script}'`), script)
  }
})
