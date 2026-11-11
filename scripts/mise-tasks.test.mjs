import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Every root script has a mise task of the same name that runs it and says what it does, so
// `mise tasks` lists the commands with their descriptions while the scripts stay their only
// definition (docs/ARCHITECTURE.md, Tooling and versions). The tasks are read through mise itself,
// so the test sees what `mise tasks` lists, includes and all.
const root = fileURLToPath(new URL('..', import.meta.url))
const scripts = Object.keys(JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).scripts)
// A lifecycle script runs on its own during `pnpm install`, never by name.
const commands = scripts.filter((name) => name !== 'prepare')
const tasks = JSON.parse(
  execFileSync('mise', ['tasks', 'ls', '--json', '--no-global'], { cwd: root, encoding: 'utf8' }),
)
const runOf = (task) => [task.run].flat().join('\n')

test('gives every root script a mise task of the same name that runs it', () => {
  assert.notEqual(commands.length, 0)
  for (const name of commands) {
    const task = tasks.find((candidate) => candidate.name === name)
    assert.ok(task, `${name} has no mise task`)
    assert.equal(runOf(task), `pnpm ${name}`, name)
  }
})

test('describes every mise task', () => {
  assert.notEqual(tasks.length, 0)
  for (const task of tasks)
    assert.match(task.description ?? '', /\S/, `${task.name} has no description`)
})

test('runs through pnpm only a root script of the same name', () => {
  for (const task of tasks.filter((candidate) => /^pnpm\b/.test(runOf(candidate)))) {
    assert.ok(scripts.includes(task.name), `${task.name} is not a root script`)
    assert.equal(runOf(task), `pnpm ${task.name}`, task.name)
  }
})
