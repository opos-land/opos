#!/usr/bin/env node
// A change to tenant isolation (rls) or to permissions and tenant context (rbac) starts with a
// test of its area (AGENTS.md, "Tests first for RLS and RBAC").
//
//   --hook               Claude Code PreToolUse hook for Edit and Write: refuses an edit of a
//                        guarded file while no test of its area has changed in the working tree
//   --before-bash        Claude Code PreToolUse hook for Bash: records the changed files' contents
//   --after-bash         Claude Code PostToolUse hook for Bash: reports a guarded file the command
//                        changed while no test of its area has changed in the working tree
//   --commit-msg <file>  lefthook commit-msg: the staged files carry a test of each changed area
//   --base <ref>         CI: the commits since <ref> carry a test of each changed area
//
// The hooks read the event on stdin. A commit whose message holds a `No-Test-Reason: <reason>`
// trailer is exempt, and so is a merge commit.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const isTest = (path) => /\.test\.[cm]?[jt]sx?$/.test(path)

const areas = [
  {
    name: 'rls',
    code: [
      /^packages\/db\/drizzle\/[^/]+\.sql$/,
      /^packages\/db\/src\/schema\//,
      /^packages\/db\/src\/(rls|verify|tenants|client)\.ts$/,
      /^infra\/supabase\/db\//,
    ],
    tests: [/^packages\/db\/test\/.+\.test\.ts$/],
    where: 'packages/db/test',
  },
  {
    name: 'rbac',
    code: [
      /^apps\/api\/src\/common\/(permissions|als|guards|database|decorators)\//,
      /^apps\/api\/src\/modules\/(tenants|editions)\//,
      /^apps\/api\/src\/app\.module\.ts$/,
      /^packages\/contract\/src\/common\.ts$/,
    ],
    tests: [/^apps\/api\/test\/.+\.test\.ts$/, /^apps\/api\/src\/.+\.test\.ts$/],
    where: 'apps/api/test or a *.test.ts beside the code',
  },
]

/** A changed file; a path alone is a file that still exists. */
const asChange = (change) =>
  typeof change === 'string' ? { path: change, deleted: false } : change

/** Whether the changes hold a test of `area` that was added or changed, not deleted. */
const testedIn = (area, changes) =>
  changes
    .map(asChange)
    .some(({ path, deleted }) => !deleted && area.tests.some((pattern) => pattern.test(path)))

/** The guarded area a path belongs to, or null; a test file belongs to none. */
export function areaOf(path) {
  if (isTest(path)) return null
  return areas.find((area) => area.code.some((pattern) => pattern.test(path)))?.name ?? null
}

/** The areas changed without a test of their own, with the files that changed, deleted included. */
export function missingTests(changes) {
  const paths = changes.map((change) => asChange(change).path)
  return areas.flatMap((area) => {
    const files = paths.filter((path) => areaOf(path) === area.name)
    return files.length > 0 && !testedIn(area, changes) ? [{ area: area.name, files }] : []
  })
}

/** Why an edit of `path` must wait for a test, given the changes so far; null to allow it. */
export function editRefusal(path, changes) {
  const name = areaOf(path)
  if (!name) return null
  const area = areas.find((candidate) => candidate.name === name)
  if (testedIn(area, changes)) return null
  return `${path} is ${name} code: write or change its test first, in ${area.where}, and watch it fail (AGENTS.md, "Tests first for RLS and RBAC"). If the change needs no test, ask the user.`
}

/**
 * The entries of `git status --porcelain` output, untouched: a status column may start with a
 * space, so the output must not be trimmed. A rename yields its new path.
 */
export function parseStatus(status) {
  return status
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => ({
      path: line.slice(3).replace(/^.* -> /, ''),
      deleted: line.slice(0, 2).includes('D'),
    }))
}

/** The entries of `git diff --name-status` output; a rename or copy yields its new path. */
export function parseNameStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t')
      return { path: paths.at(-1), deleted: status === 'D' }
    })
}

/** The paths whose content differs between two snapshots of path -> hash, either side missing. */
export function touched(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...paths].filter((path) => before[path] !== after[path])
}

/** Whether a commit message carries a `No-Test-Reason:` trailer with a reason. */
export function exempted(message) {
  return /^No-Test-Reason:[ \t]*\S/m.test(message)
}

const raw = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const git = (...args) => raw(...args).trim()
const lines = (output) => (output ? output.split('\n') : [])
const workingTree = () => parseStatus(raw('status', '--porcelain', '--untracked-files=all'))

/** The changed files of the working tree, by path, with a hash of their content or 'deleted'. */
function snapshot() {
  const root = git('rev-parse', '--show-toplevel')
  return Object.fromEntries(
    workingTree().map(({ path, deleted }) => {
      const file = join(root, path)
      return [path, deleted || !existsSync(file) ? 'deleted' : git('hash-object', file)]
    }),
  )
}

const snapshotFile = (event) =>
  join(
    tmpdir(),
    `opos-tests-first-${String(event.session_id ?? 'session').replace(/\W/g, '')}.json`,
  )

function report(missing) {
  for (const { area, files } of missing) {
    const where = areas.find((candidate) => candidate.name === area).where
    console.error(`${area} code changed without a test in ${where}:\n  ${files.join('\n  ')}`)
  }
}

const readEvent = () => JSON.parse(readFileSync(0, 'utf8'))

function main([mode, value]) {
  if (mode === '--hook') {
    const event = readEvent()
    const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path
    if (!target) return 0
    const refusal = editRefusal(
      relative(git('rev-parse', '--show-toplevel'), target),
      workingTree(),
    )
    if (!refusal) return 0
    console.error(refusal)
    return 2
  }
  if (mode === '--before-bash') {
    writeFileSync(snapshotFile(readEvent()), JSON.stringify(snapshot()))
    return 0
  }
  if (mode === '--after-bash') {
    const file = snapshotFile(readEvent())
    if (!existsSync(file)) return 0
    const before = JSON.parse(readFileSync(file, 'utf8'))
    rmSync(file)
    const changed = touched(before, snapshot()).filter((path) => areaOf(path))
    const missing = missingTests(workingTree()).filter(({ files }) =>
      files.some((path) => changed.includes(path)),
    )
    if (missing.length === 0) return 0
    console.error('The command changed RLS or RBAC code while no test of its area has changed:')
    report(missing)
    console.error(
      'Revert it, or write the test first and watch it fail (AGENTS.md, "Tests first for RLS and RBAC").',
    )
    return 2
  }
  if (mode === '--commit-msg') {
    // A merge brings commits checked on their own branch; CI skips merges the same way.
    if (existsSync(git('rev-parse', '--git-path', 'MERGE_HEAD'))) return 0
    if (exempted(readFileSync(value, 'utf8'))) return 0
    const missing = missingTests(parseNameStatus(raw('diff', '--cached', '--name-status')))
    if (missing.length === 0) return 0
    report(missing)
    console.error(
      'Add the test, or state why none applies with a `No-Test-Reason: <reason>` trailer in the commit message.',
    )
    return 1
  }
  if (mode === '--base') {
    const unexempted = lines(git('rev-list', '--no-merges', `${value}..HEAD`)).filter(
      (commit) => !exempted(git('log', '-1', '--format=%B', commit)),
    )
    const changes = unexempted.flatMap((commit) =>
      parseNameStatus(raw('diff-tree', '--no-commit-id', '--name-status', '-r', commit)),
    )
    const missing = missingTests(changes)
    if (missing.length === 0) return 0
    report(missing)
    console.error(
      'Add the test, or state why none applies with a `No-Test-Reason: <reason>` trailer in the commit message.',
    )
    return 1
  }
  console.error(
    'Usage: tests-first.mjs --hook | --before-bash | --after-bash | --commit-msg <file> | --base <ref>',
  )
  return 64
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
