#!/usr/bin/env node
// Drizzle's migrator applies a migration only when its journal `when` is greater than the last
// applied one, and compares no hashes. CI replays every migration on an empty database, so a late
// merged migration with an older `when`, or an edited one the base branch already holds, would
// pass there and silently never reach a database that is already migrated.
//
//   --base <ref>        the journal and the .sql files in the working tree, against the same on <ref>
//   --merge-base <ref>  the same against `git merge-base HEAD <ref>`, so a branch that is merely
//                       behind <ref> is not refused for the newer migrations of <ref>

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const directory = 'packages/db/drizzle'

/**
 * One line per problem. `journal` is the `entries` of `_journal.json`, `files` maps a tag to the
 * text of its .sql file; `baseJournal` and `baseFiles` are the same on the base branch.
 */
export function checkMigrations({ journal, files, baseJournal, baseFiles }) {
  const problems = []
  const tags = new Set(journal.map((entry) => entry.tag))

  for (const tag of tags) {
    if (!files.has(tag)) problems.push(`${tag} is in the journal but has no file`)
  }
  for (const tag of files.keys()) {
    if (!tags.has(tag)) problems.push(`${tag} is a file but has no journal entry`)
  }

  for (let idx = 1; idx < journal.length; idx++) {
    if (journal[idx].when <= journal[idx - 1].when) {
      problems.push(
        `${journal[idx].tag} has a timestamp older than or equal to ${journal[idx - 1].tag}; Drizzle would skip it`,
      )
    }
  }

  const moved = baseJournal.findIndex((entry, idx) => journal[idx]?.tag !== entry.tag)
  if (moved !== -1) {
    problems.push(
      `${baseJournal[moved].tag} is at position ${moved} in the base branch, but ${journal[moved]?.tag ?? 'nothing'} is there now; a merged migration is never removed or reordered`,
    )
  }

  const whenOf = new Map(journal.map((entry) => [entry.tag, entry.when]))
  for (const { tag, when } of baseJournal) {
    if (whenOf.has(tag) && whenOf.get(tag) !== when) {
      problems.push(
        `${tag} has timestamp ${whenOf.get(tag)}, but the base branch merged it with ${when}; Drizzle would rerun it`,
      )
    }
    if (files.has(tag) && files.get(tag) !== baseFiles.get(tag)) {
      problems.push(`${tag} changed after the base branch merged it; add a new migration instead`)
    }
  }

  return problems
}

/** The journal entries and the .sql files of `ref`, or of the working tree when `ref` is null. */
function loadMigrations(ref, root) {
  const read = (path) =>
    ref === null
      ? readFileSync(join(root, path), 'utf8')
      : execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' })
  const names =
    ref === null
      ? readdirSync(join(root, directory))
      : execFileSync('git', ['ls-tree', '--name-only', `${ref}:${directory}`], {
          cwd: root,
          encoding: 'utf8',
        }).split('\n')
  const journal = JSON.parse(read(`${directory}/meta/_journal.json`)).entries
  const files = new Map(
    names
      .filter((name) => name.endsWith('.sql'))
      .map((name) => [name.slice(0, -'.sql'.length), read(`${directory}/${name}`)]),
  )
  return { journal, files }
}

/** The commit the working tree branched from `ref`; `git` fails when it cannot name one. */
function mergeBaseOf(ref, root) {
  return execFileSync('git', ['merge-base', 'HEAD', ref], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

/** `load(ref, root)`, `log(line)` and `root`, a repository of their own, are injected by the tests. */
export function main(
  argv,
  { load = loadMigrations, log = console.error, root = repositoryRoot } = {},
) {
  const [form, ref] = argv
  if ((form !== '--base' && form !== '--merge-base') || !ref) {
    log('Usage: check-migrations.mjs --base <ref> | --merge-base <ref>')
    return 64
  }
  let target = ref
  if (form === '--merge-base') {
    try {
      target = mergeBaseOf(ref, root)
    } catch {
      log(`Cannot find the merge base of HEAD and ${ref}; fetch it, or compare with --base`)
      return 1
    }
  }
  const current = load(null, root)
  let base
  try {
    base = load(target, root)
  } catch {
    log(`Cannot read the migrations of ${ref}; fetch it, or check that it holds ${directory}`)
    return 1
  }
  const problems = checkMigrations({
    journal: current.journal,
    files: current.files,
    baseJournal: base.journal,
    baseFiles: base.files,
  })
  problems.forEach(log)
  return problems.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
