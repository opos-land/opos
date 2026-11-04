import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'migration-reminder.mjs')

const run = (event, input = JSON.stringify(event)) => {
  const result = spawnSync('node', [script], { input, encoding: 'utf8' })
  assert.equal(result.status, 0)
  return result.stdout
}

test('an edit of a migration returns the rules as additional context', () => {
  const output = JSON.parse(run({ tool_input: { file_path: 'packages/db/drizzle/0020_x.sql' } }))
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse')
  const context = output.hookSpecificOutput.additionalContext
  for (const rule of [
    'force row level security',
    'tenant_isolation',
    "search_path = ''",
    'revoke execute',
    'verify.ts',
    'pnpm db:verify',
    'db:seed',
    'tenant-isolation-reviewer',
  ]) {
    assert.match(context, new RegExp(rule))
  }
})

test('an absolute path to a migration counts as well', () => {
  const file_path = '/work/opos/packages/db/drizzle/0020_x.sql'
  assert.match(run({ tool_input: { file_path } }), /additionalContext/)
})

test('any other file returns nothing', () => {
  assert.equal(run({ tool_input: { file_path: 'packages/db/src/schema/tenants.ts' } }), '')
  assert.equal(run({ tool_input: { file_path: 'packages/db/drizzle/meta/_journal.json' } }), '')
})

test('input that is not an edit returns nothing and does not fail', () => {
  assert.equal(run({}), '')
  assert.equal(run({ tool_input: {} }), '')
  assert.equal(run(null, 'not json'), '')
})
