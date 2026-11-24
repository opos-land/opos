#!/usr/bin/env node
// Whether a pull request changes anything the e2e job reads. That job sets up the stack, starts the
// four applications and runs every scenario of e2e/specs; a change confined to what none of that
// reads (the documents, the deployment, the agents' configuration, the other workflows, the tooling
// scripts) cannot change its result, and the job is skipped
// (docs/adr/0086-skip-the-e2e-job-on-a-pull-request-it-cannot-fail.md).
//
//   --base <ref>  the files changed since HEAD left <ref>; prints e2e=true or e2e=false and appends
//                 it to $GITHUB_OUTPUT when set. A failure leaves the output unset, and the job runs.

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The first rule whose pattern matches a path decides whether it needs the e2e job; a path no rule
 * names needs it, so a new directory is covered until a rule says otherwise.
 */
const RULES = [
  // The job itself, and what stack:init runs and starts
  [/^\.github\/workflows\/ci\.yml$/, true],
  [/^scripts\/stack-init\.mjs$/, true],
  [/^infra\/local\//, true],
  // The documents, the deployment, the agents, the other workflows and the tooling
  [/^[^/]+\.md$/, false],
  [/^docs\//, false],
  [/^infra\//, false],
  [/^\.claude\//, false],
  [/^\.github\//, false],
  [/^scripts\//, false],
  [/^(\.dockerignore|\.gitleaks\.toml|commitlint\.config\.mjs|lefthook\.yml)$/, false],
]

const needs = (path) => RULES.find(([pattern]) => pattern.test(path))?.[1] ?? true

/** Whether any of the changed `paths` is one the e2e job reads. */
export function needsE2e(paths) {
  return paths.some(needs)
}

/** The paths changed since HEAD left `ref`, a rename as both its paths. */
function changedPaths(ref, root) {
  return execFileSync('git', ['diff', '--name-only', '--no-renames', `${ref}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\n')
    .filter(Boolean)
}

/** `root`, a repository of their own, `env` and `log(line)` are injected by the tests. */
export function main(argv, { root = repositoryRoot, env = process.env, log = console.log } = {}) {
  const [form, ref] = argv
  if (form !== '--base' || !ref) {
    log('Usage: e2e-scope.mjs --base <ref>')
    return 64
  }
  let paths
  try {
    paths = changedPaths(ref, root)
  } catch {
    log(`Cannot diff HEAD against ${ref}; fetch it with its history`)
    return 1
  }
  const reached = paths.filter(needs)
  for (const path of reached) log(`the e2e job reads ${path}`)
  const line = `e2e=${reached.length > 0}`
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${line}\n`)
  log(line)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
