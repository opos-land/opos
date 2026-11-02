#!/usr/bin/env node
// Drizzle's migrator applies a migration only when its journal `when` is greater than the last
// applied one, and compares no hashes. CI replays every migration on an empty database, so a late
// merged migration with an older `when`, or an edited one the base branch already holds, would
// pass there and silently never reach a database that is already migrated.
//
//   --base <ref>  the journal and the .sql files in the working tree, against the same on <ref>

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
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
function loadMigrations(ref) {
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

/** `load(ref)` and `log(line)` are injected by the tests. */
export function main(argv, { load = loadMigrations, log = console.error } = {}) {
  if (argv[0] !== '--base' || !argv[1]) {
    log('Usage: check-migrations.mjs --base <ref>')
    return 64
  }
  const current = load(null)
  let base
  try {
    base = load(argv[1])
  } catch {
    log(`Cannot read the migrations of ${argv[1]}; fetch it, or check that it holds ${directory}`)
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
