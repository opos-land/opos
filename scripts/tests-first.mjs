#!/usr/bin/env node
// A change to tenant isolation (rls) or to permissions and tenant context (rbac) starts with a
// test of its area (AGENTS.md, "Tests first for RLS and RBAC").
//
//   --hook               Claude Code PreToolUse hook: refuses an edit of a guarded file while no
//                        test of its area has changed in the working tree; reads the event on stdin
//   --commit-msg <file>  lefthook commit-msg: the staged files carry a test of each changed area
//   --base <ref>         CI: the commits since <ref> carry a test of each changed area
//
// A commit whose message holds a `No-Test-Reason: <reason>` trailer is exempt.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const isTest = (path) => /\.test\.[cm]?[jt]sx?$/.test(path)

const areas = [
  {
    name: 'rls',
    code: [
      /^packages\/db\/drizzle\/[^/]+\.sql$/,
      /^packages\/db\/src\/schema\//,
      /^packages\/db\/src\/(rls|verify|tenants)\.ts$/,
      /^infra\/supabase\/db\//,
    ],
    tests: [/^packages\/db\/test\/.+\.test\.ts$/],
    where: 'packages/db/test',
  },
  {
    name: 'rbac',
    code: [
      /^apps\/api\/src\/common\/(permissions|als|guards|database)\//,
      /^apps\/api\/src\/modules\/(tenants|editions)\//,
      /^packages\/contract\/src\/common\.ts$/,
    ],
    tests: [/^apps\/api\/test\/.+\.test\.ts$/, /^apps\/api\/src\/.+\.test\.ts$/],
    where: 'apps/api/test or a *.test.ts beside the code',
  },
]

/** The guarded area a path belongs to, or null; a test file belongs to none. */
export function areaOf(path) {
  if (isTest(path)) return null
  return areas.find((area) => area.code.some((pattern) => pattern.test(path)))?.name ?? null
}

/** The areas changed without a test of their own among `paths`, with the files that changed. */
export function missingTests(paths) {
  return areas.flatMap((area) => {
    const files = paths.filter((path) => areaOf(path) === area.name)
    const tested = paths.some((path) => area.tests.some((pattern) => pattern.test(path)))
    return files.length > 0 && !tested ? [{ area: area.name, files }] : []
  })
}

/** Why an edit of `path` must wait for a test, given the files changed so far; null to allow it. */
export function editRefusal(path, changed) {
  const name = areaOf(path)
  if (!name) return null
  const area = areas.find((candidate) => candidate.name === name)
  if (changed.some((file) => area.tests.some((pattern) => pattern.test(file)))) return null
  return `${path} is ${name} code: write or change its test first, in ${area.where}, and watch it fail (AGENTS.md, "Tests first for RLS and RBAC").`
}

/**
 * The paths of `git status --porcelain` output, untouched: a status column may start with a space,
 * so the output must not be trimmed. A rename yields its new path.
 */
export function changedPaths(status) {
  return status
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).replace(/^.* -> /, ''))
}

/** Whether a commit message carries a `No-Test-Reason:` trailer with a reason. */
export function exempted(message) {
  return /^No-Test-Reason:[ \t]*\S/m.test(message)
}

const raw = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const git = (...args) => raw(...args).trim()
const lines = (output) => (output ? output.split('\n') : [])

function report(missing) {
  for (const { area, files } of missing) {
    const where = areas.find((candidate) => candidate.name === area).where
    console.error(`${area} code changed without a test in ${where}:\n  ${files.join('\n  ')}`)
  }
  console.error(
    'Add the test, or state why none applies with a `No-Test-Reason: <reason>` trailer in the commit message.',
  )
}

function main([mode, value]) {
  if (mode === '--hook') {
    const event = JSON.parse(readFileSync(0, 'utf8'))
    const root = git('rev-parse', '--show-toplevel')
    const target = event.tool_input?.file_path ?? event.tool_input?.notebook_path
    if (!target) return 0
    const path = relative(root, target)
    // Changed, staged and untracked files of the working tree.
    const changed = changedPaths(raw('status', '--porcelain', '--untracked-files=all'))
    const refusal = editRefusal(path, changed)
    if (!refusal) return 0
    console.error(refusal)
    return 2
  }
  if (mode === '--commit-msg') {
    if (exempted(readFileSync(value, 'utf8'))) return 0
    const missing = missingTests(lines(git('diff', '--cached', '--name-only')))
    if (missing.length === 0) return 0
    report(missing)
    return 1
  }
  if (mode === '--base') {
    const range = `${value}...HEAD`
    const unexempted = lines(git('rev-list', '--no-merges', range)).filter(
      (commit) => !exempted(git('log', '-1', '--format=%B', commit)),
    )
    const paths = new Set(
      unexempted.flatMap((commit) =>
        lines(git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)),
      ),
    )
    const missing = missingTests([...paths])
    if (missing.length === 0) return 0
    report(missing)
    return 1
  }
  console.error('Usage: tests-first.mjs --hook | --commit-msg <file> | --base <ref>')
  return 64
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
