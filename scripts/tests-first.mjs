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
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
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
 * space, so the output must not be trimmed. A rename yields its old path, deleted, and its new one.
 */
export function parseStatus(status) {
  return status
    .split('\n')
    .filter((line) => line.length > 3)
    .flatMap((line) => {
      const [path, from] = line.slice(3).split(' -> ').reverse()
      const deleted = line.slice(0, 2).includes('D')
      return line[0] === 'R'
        ? [
            { path: from, deleted: true },
            { path, deleted },
          ]
        : [{ path, deleted }]
    })
}

/**
 * The entries of `git diff --name-status` output. A rename yields its old path, deleted, and its new
 * one; a copy yields its new path.
 */
export function parseNameStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const [status, ...paths] = line.split('\t')
      const path = paths.at(-1)
      if (status.startsWith('R'))
        return [
          { path: paths[0], deleted: true },
          { path, deleted: false },
        ]
      return [{ path, deleted: status === 'D' }]
    })
}

/** The paths whose content differs between two snapshots of path -> hash, either side missing. */
export function touched(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...paths].filter((path) => before[path] !== after[path])
}

/**
 * Whether a commit message carries a `No-Test-Reason:` trailer with a reason. Trailers are the
 * last paragraph after the subject, every line of it a `Key: value` or a folded continuation;
 * comment lines and everything below the scissors line of `git commit -v` are not the message.
 */
export function exempted(message) {
  const paragraphs = message
    .split(/^# -+ >8 -+$/m)[0]
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim()
    .split(/\n[ \t]*\n/)
  if (paragraphs.length < 2) return false
  const trailers = paragraphs.at(-1).split('\n')
  return (
    trailers.every((line) => /^[\w-]+:[ \t]/.test(line) || /^[ \t]+\S/.test(line)) &&
    trailers.some((line) => /^No-Test-Reason:[ \t]*\S/.test(line))
  )
}

const lines = (output) => (output ? output.split('\n') : [])

/** Git in the repository that holds `cwd`. */
function repository(cwd) {
  const raw = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  const git = (...args) => raw(...args).trim()
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

  return { raw, git, workingTree, snapshot }
}

/** The real path of `path`, resolved through its deepest existing ancestor: a new file has none. */
function realPath(path) {
  try {
    return realpathSync(path)
  } catch {
    return join(realPath(dirname(path)), basename(path))
  }
}

/** Runs a Claude Code hook so that a check which cannot run refuses the change it was asked about. */
function failClosed(check) {
  try {
    return check()
  } catch (error) {
    console.error(`tests-first could not check this change, so it refuses it: ${error.message}`)
    return 2
  }
}

function report(missing) {
  for (const { area, files } of missing) {
    const where = areas.find((candidate) => candidate.name === area).where
    console.error(`${area} code changed without a test in ${where}:\n  ${files.join('\n  ')}`)
  }
}

/**
 * Runs one mode in the repository that holds `cwd`; `stdin` reads the hook event. Returns the exit
 * code.
 */
export function main(
  [mode, value],
  { cwd = process.cwd(), stdin = () => readFileSync(0, 'utf8') } = {},
) {
  const { raw, git, workingTree, snapshot } = repository(cwd)
  const readEvent = () => JSON.parse(stdin())
  // One record per Bash call, inside the repository: calls of one session may overlap.
  const snapshotFile = (event) => {
    const id = String(event.tool_use_id ?? event.session_id ?? 'bash').replace(/\W/g, '')
    return resolve(cwd, git('rev-parse', '--git-path', `tests-first-${id}.json`))
  }
  if (mode === '--hook') {
    return failClosed(() => {
      const event = readEvent()
      const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path
      if (!target) return 0
      const root = git('rev-parse', '--show-toplevel')
      const refusal = editRefusal(relative(root, realPath(resolve(cwd, target))), workingTree())
      if (!refusal) return 0
      console.error(refusal)
      return 2
    })
  }
  if (mode === '--before-bash') {
    writeFileSync(snapshotFile(readEvent()), JSON.stringify(snapshot()))
    return 0
  }
  if (mode === '--after-bash') {
    return failClosed(() => {
      const file = snapshotFile(readEvent())
      // Without the record of --before-bash, every changed file counts as the command's.
      const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
      rmSync(file, { force: true })
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
    })
  }
  if (mode === '--commit-msg') {
    // A merge brings commits checked on their own branch; CI skips merges the same way.
    if (existsSync(resolve(cwd, git('rev-parse', '--git-path', 'MERGE_HEAD')))) return 0
    if (exempted(readFileSync(resolve(cwd, value), 'utf8'))) return 0
    const missing = missingTests(parseNameStatus(raw('diff', '--cached', '--name-status')))
    if (missing.length === 0) return 0
    report(missing)
    console.error(
      'Add the test, or state why none applies with a `No-Test-Reason: <reason>` trailer in the commit message.',
    )
    return 1
  }
  if (mode === '--base') {
    // Each commit carries its own test: a test in a later commit covers nothing before it.
    const failing = lines(git('rev-list', '--reverse', '--no-merges', `${value}..HEAD`)).flatMap(
      (commit) => {
        if (exempted(git('log', '-1', '--format=%B', commit))) return []
        const changes = parseNameStatus(
          raw('diff-tree', '--no-commit-id', '--name-status', '-r', commit),
        )
        const missing = missingTests(changes)
        return missing.length > 0 ? [{ commit, missing }] : []
      },
    )
    if (failing.length === 0) return 0
    for (const { commit, missing } of failing) {
      console.error(git('log', '-1', '--format=%H %s', commit).replace(/^(\w{12})\w+/, '$1'))
      report(missing)
    }
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

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
