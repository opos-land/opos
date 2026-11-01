#!/usr/bin/env node
// A change of code starts with a test of its area (AGENTS.md, "Tests first"): tenant isolation
// (rls) and permissions and tenant context (rbac) with tests in fixed places, any other code with
// a test of its own package.
//
//   --hook               Claude Code PreToolUse hook for Edit and Write: refuses an edit of an
//                        area's code while no test of that area has changed in the working tree
//   --before-bash        Claude Code PreToolUse hook for Bash: records the changed files' contents
//   --after-bash         Claude Code PostToolUse hook for Bash: reports an area's code the command
//                        changed while no test of that area has changed in the working tree
//   --commit-msg <file>  lefthook commit-msg: the staged files carry a test of each changed area
//   --base <ref>         CI: each commit since <ref> carries a test of each area it changes; a
//                        merge, of each area it changes beyond merging its parents
//
// The hooks read the event on stdin. A commit whose message holds a `No-Test-Reason: <reason>`
// trailer is exempt; lefthook leaves a merge commit to CI.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const isTest = (path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)

/**
 * Whether a path is code: a script or SQL, but no type declaration, tool configuration, test
 * helper or fixture, the e2e package, a catalog, installed or built output, or a file outside the
 * repository.
 */
const isCode = (path) =>
  /\.([cm]?[jt]sx?|sql)$/.test(path) &&
  !/\.d\.[cm]?ts$/.test(path) &&
  !/(^|\/)(eslint|vite|vitest|lingui|drizzle|tsdown|playwright|commitlint)\.config(\.\w+)?\.[cm]?[jt]s$/.test(
    path,
  ) &&
  !/(^|\/)(test|fixtures|locales|node_modules|dist|build|coverage|\.turbo)\//.test(path) &&
  !/^(e2e\/|\.\.\/|\/)/.test(path)

/** Any other code of a package, covered by a test anywhere in the same package. */
const packageArea = (name, dir) => {
  const prefix = dir.replaceAll('.', '\\.')
  return {
    name,
    code: [new RegExp(`^${prefix}/`)],
    tests: [new RegExp(`^${prefix}/.+\\.test\\.[cm]?[jt]sx?$`)],
    where: dir,
  }
}

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
      // Every module but mail and health reads or writes as an account, a tenant or an edition.
      /^apps\/api\/src\/modules\/(?!(mail|health)\/)/,
      /^apps\/api\/src\/app\.module\.ts$/,
      // The routes and the access each one requires.
      /^packages\/contract\/src\/(?!(errors|index)\.ts$)[^/]+\.ts$/,
    ],
    tests: [/^apps\/api\/test\/.+\.test\.ts$/, /^apps\/api\/src\/.+\.test\.ts$/],
    where: 'apps/api/test or a *.test.ts beside the code',
  },
  packageArea('api', 'apps/api'),
  packageArea('panel', 'apps/panel'),
  packageArea('portal', 'apps/portal'),
  packageArea('db', 'packages/db'),
  packageArea('contract', 'packages/contract'),
  packageArea('i18n', 'packages/i18n'),
  packageArea('eslint-config', 'packages/eslint-config'),
  packageArea('scripts', 'scripts'),
  packageArea('claude', '.claude'),
  // Code anywhere else waits for an area of its own, here and in AGENTS.md.
  { name: 'unlisted', code: [/^/], tests: [], where: 'an area of its own' },
]

/** A changed file; a path alone is a file that still exists. */
const asChange = (change) =>
  typeof change === 'string' ? { path: change, deleted: false } : change

/** Whether the changes hold a test of `area` that was added or changed, not deleted or hollow. */
const testedIn = (area, changes) =>
  changes
    .map(asChange)
    .some(
      ({ path, deleted, hollow }) =>
        !deleted && !hollow && area.tests.some((pattern) => pattern.test(path)),
    )

/** Whether a test file's source holds a test: a call of `describe`, `it` or `test`. */
export function holdsTests(source) {
  return /\b(describe|it|test)(\.\w+)*\s*[(`]/.test(source)
}

/** The changes with each test file that holds no test marked hollow; `read` returns its source. */
function weighTests(changes, read) {
  const source = (path) => {
    try {
      return read(path)
    } catch {
      return ''
    }
  }
  return changes.map((change) =>
    isTest(change.path) && !change.deleted
      ? { ...change, hollow: !holdsTests(source(change.path)) }
      : change,
  )
}

/** The first area whose code matches a path, or null for a test or a file that is not code. */
export function areaOf(path) {
  if (isTest(path) || !isCode(path)) return null
  return areas.find((area) => area.code.some((pattern) => pattern.test(path))).name
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
  if (name === 'unlisted') {
    return `${path} is code outside every area: add its area to scripts/tests-first.mjs and to the table in AGENTS.md ("Tests first") before writing it.`
  }
  return `${path} is ${name} code: write or change its test first, in ${area.where}, and watch it fail (AGENTS.md, "Tests first"). If the change needs no test, ask the user.`
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
  const status = () => parseStatus(raw('status', '--porcelain', '--untracked-files=all'))
  const workingTree = () =>
    weighTests(status(), (path) =>
      readFileSync(join(git('rev-parse', '--show-toplevel'), path), 'utf8'),
    )

  /** The changed files of the working tree, by path, with a hash of their content or 'deleted'. */
  function snapshot() {
    const root = git('rev-parse', '--show-toplevel')
    return Object.fromEntries(
      status().map(({ path, deleted }) => {
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
export function main([mode, value], { cwd, stdin }) {
  const { raw, git, workingTree, snapshot } = repository(cwd)
  const readEvent = () => JSON.parse(stdin())
  // One record per Bash call, inside the repository: calls of one session may overlap.
  const snapshotFile = (event) => {
    const id = String(event.tool_use_id ?? event.session_id ?? 'bash').replace(/\W/g, '')
    return resolve(cwd, git('rev-parse', '--git-path', `tests-first-${id}.json`))
  }
  // While git resolves a merge, rebase, cherry-pick or revert the hooks stand aside: what the
  // resolution adds is checked in CI, in the commit it ends up in. A rebase is in progress while
  // its directory exists; git leaves REBASE_HEAD behind once it has finished.
  const resolving = () =>
    ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'].some((name) =>
      existsSync(resolve(cwd, git('rev-parse', '--git-path', name))),
    )
  if (mode === '--hook') {
    return failClosed(() => {
      const event = readEvent()
      const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path
      if (!target || resolving()) return 0
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
      if (resolving()) return 0
      // Without the record of --before-bash, every changed file counts as the command's.
      const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
      rmSync(file, { force: true })
      const changed = touched(before, snapshot()).filter((path) => areaOf(path))
      const missing = missingTests(workingTree()).filter(({ files }) =>
        files.some((path) => changed.includes(path)),
      )
      if (missing.length === 0) return 0
      console.error('The command changed code while no test of its area has changed:')
      report(missing)
      console.error(
        'Revert it, or write the test first and watch it fail (AGENTS.md, "Tests first").',
      )
      return 2
    })
  }
  if (mode === '--commit-msg') {
    // A merge brings commits checked on their own branch; CI checks what the merge adds.
    if (existsSync(resolve(cwd, git('rev-parse', '--git-path', 'MERGE_HEAD')))) return 0
    if (exempted(readFileSync(resolve(cwd, value), 'utf8'))) return 0
    const staged = parseNameStatus(raw('diff', '--cached', '--name-status'))
    const missing = missingTests(weighTests(staged, (path) => raw('show', `:${path}`)))
    if (missing.length === 0) return 0
    report(missing)
    console.error(
      'Add the test, or state why none applies with a `No-Test-Reason: <reason>` trailer in the commit message.',
    )
    return 1
  }
  if (mode === '--base') {
    // Each commit carries its own test: a test in a later commit covers nothing before it. A
    // merge counts by what it adds beyond merging its parents, a conflict resolution included.
    const failing = lines(git('rev-list', '--reverse', `${value}..HEAD`)).flatMap((commit) => {
      if (exempted(git('log', '-1', '--format=%B', commit))) return []
      const merge = git('rev-list', '--parents', '-n', '1', commit).split(' ').length > 2
      const changes = parseNameStatus(
        merge
          ? raw('log', '-1', '--remerge-diff', '--name-status', '--format=', commit)
          : raw('diff-tree', '--no-commit-id', '--name-status', '-r', commit),
      )
      const missing = missingTests(weighTests(changes, (path) => raw('show', `${commit}:${path}`)))
      return missing.length > 0 ? [{ commit, missing }] : []
    })
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

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    stdin: () => readFileSync(0, 'utf8'),
  })
}
