import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Every root script has a mise task of the same name that runs it and says what it does, so
// `mise tasks` lists the commands with their descriptions while the scripts stay their only
// definition (docs/ARCHITECTURE.md, Tooling and versions). The tasks are read through mise itself,
// so the test sees what `mise tasks` lists, includes and all, and the hidden tasks beside them.
const root = fileURLToPath(new URL('..', import.meta.url))
const packageScripts = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')).scripts
const scripts = Object.keys(packageScripts)
// A lifecycle script runs on its own during `pnpm install`, never by name.
const commands = scripts.filter((name) => name !== 'prepare')
const tasks = JSON.parse(
  execFileSync('mise', ['tasks', 'ls', '--json', '--no-global', '--hidden'], {
    cwd: root,
    encoding: 'utf8',
  }),
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

// `mise tasks` pads the names to the longest and sets the description beside it, two columns of
// space each side; a longer row wraps. Who may run a command and what each flag does belong to
// its help, not to this one line.
const WIDTH = 120

test(`describes every mise task on one row of a ${WIDTH}-column terminal`, () => {
  const names = Math.max(...tasks.map((task) => task.name.length))
  const wrapped = tasks
    .filter((task) => names + 2 + task.description.length + 2 > WIDTH)
    .map((task) => task.name)
  assert.deepEqual(wrapped, [], `at most ${WIDTH - names - 4} characters`)
})

// A command whose script answers --help gets it through `mise run` as well: its task hands every
// argument on (`raw_args`), where mise would otherwise print the task's own definition.
// `mise tasks ls --json` does not show raw_args, so each task's block of the file is read.
const scriptFile = (name) => /^node (scripts\/[\w-]+\.mjs)\b/.exec(packageScripts[name])?.[1]
const answersHelp = (name) =>
  scriptFile(name) !== undefined &&
  readFileSync(`${root}/${scriptFile(name)}`, 'utf8').includes("'--help'")
const block = (name) =>
  readFileSync(`${root}/mise-tasks.toml`, 'utf8')
    .split(/^(?=\[)/m)
    .find((part) => part.startsWith(`["${name}"]`) || part.startsWith(`[${name}]`))

test('hands --help on to the commands whose script answers it, and to no other', () => {
  const answering = commands.filter(answersHelp)
  assert.ok(answering.includes('deploy:apply') && answering.includes('infra:graph'))
  for (const name of commands)
    assert.equal(/^raw_args = true$/m.test(block(name)), answering.includes(name), name)
})

test('shows the help of the command, not of the task, through mise run', () => {
  const help = execFileSync('mise', ['run', 'deploy:output', '--help'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  assert.match(help, /^usage: pnpm deploy:output <environment> \[unit\]$/m)
})

// A task is only the root script of its name with a description: what the command runs, and the
// variables it sets, live in the script, so `pnpm <name>` and `mise run <name>` do the same.
test('runs from every mise task the root script of its name, and nothing else', () => {
  for (const task of tasks) {
    assert.ok(scripts.includes(task.name), `${task.name} is not a root script`)
    assert.equal(runOf(task), `pnpm ${task.name}`, task.name)
    assert.deepEqual(task.env, [], `${task.name} sets variables the root script does not`)
  }
})
