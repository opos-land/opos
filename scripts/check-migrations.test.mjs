import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { checkMigrations, main } from './check-migrations.mjs'

const fixtures = []
after(() => fixtures.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const names = ['a', 'b', 'c', 'd']

/** Tags `0000_a`, `0001_b`, ... for `count` migrations. */
const tagsOf = (count) =>
  names.slice(0, count).map((name, idx) => `${String(idx).padStart(4, '0')}_${name}`)

/** A journal and its files from timestamps (or explicit tags), each file holding `sql <tag>`. */
function side(when, tags = tagsOf(when.length), sql = {}) {
  return {
    journal: tags.map((tag, idx) => ({
      idx,
      version: '7',
      when: when[idx],
      tag,
      breakpoints: true,
    })),
    files: new Map(tags.map((tag) => [tag, sql[tag] ?? `sql ${tag}`])),
  }
}

/** The input of checkMigrations: the base equals the current state unless overridden. */
function state({ when, tags, sql, baseWhen = when, baseTags = tags, baseSql = sql }) {
  const current = side(when, tags, sql)
  const base = side(baseWhen, baseTags, baseSql)
  return {
    journal: current.journal,
    files: current.files,
    baseJournal: base.journal,
    baseFiles: base.files,
  }
}

test('a later migration with an older timestamp is refused', () => {
  const problems = checkMigrations(state({ when: [10, 20, 15] }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0002_c.*older than.*0001_b/)
})

test('an equal timestamp is refused, since Drizzle compares with <', () => {
  const problems = checkMigrations(state({ when: [10, 10] }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_b.*older than or equal to.*0000_a/)
})

test('editing a migration the base already holds is refused', () => {
  const problems = checkMigrations(
    state({ when: [10], baseSql: { '0000_a': 'old' }, sql: { '0000_a': 'new' } }),
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0000_a.*changed/)
})

test('changing the timestamp of a base migration is refused', () => {
  const problems = checkMigrations(state({ when: [10, 30], baseWhen: [10, 20] }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_b.*timestamp 30.*merged it with 20/)
})

test('removing a base migration is refused', () => {
  const problems = checkMigrations(state({ when: [10], baseWhen: [10, 20] }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_b.*base/)
})

test('reordering base migrations is refused once, at the first position that differs', () => {
  const problems = checkMigrations(
    state({ when: [10, 20], tags: ['0001_b', '0000_a'], baseTags: ['0000_a', '0001_b'] }),
  )
  const positional = problems.filter((problem) => /position/.test(problem))
  assert.equal(positional.length, 1)
  assert.match(positional[0], /0000_a.*position 0.*0001_b/)
})

test('a journal entry without a file is refused', () => {
  const input = state({ when: [10, 20] })
  input.files.delete('0001_b')
  input.baseFiles.delete('0001_b')
  const problems = checkMigrations(input)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_b.*no file/)
})

test('a file without a journal entry is refused', () => {
  const input = state({ when: [10] })
  input.files.set('0001_orphan', 'sql')
  const problems = checkMigrations(input)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_orphan.*no journal entry/)
})

test('a new migration after the base passes', () => {
  assert.deepEqual(checkMigrations(state({ when: [10, 20], baseWhen: [10] })), [])
})

test('the repository passes against itself', () => {
  assert.equal(main(['--base', 'HEAD'], { log: () => {} }), 0)
})

test('the CLI exits 1 and prints one line per problem', () => {
  const lines = []
  const input = state({ when: [10, 10, 5], baseWhen: [10] })
  const code = main(['--base', 'origin/develop'], {
    load: (ref) =>
      ref === null
        ? { journal: input.journal, files: input.files }
        : { journal: input.baseJournal, files: input.baseFiles },
    log: (line) => lines.push(line),
  })
  assert.equal(code, 1)
  assert.equal(lines.length, 2)
  assert.match(lines[0], /0001_b/)
  assert.match(lines[1], /0002_c/)
})

test('the CLI asks the loader for the working tree, then for the base ref it was given', () => {
  const refs = []
  const input = state({ when: [10] })
  const code = main(['--base', 'origin/develop'], {
    load: (ref) => {
      refs.push(ref)
      return { journal: input.journal, files: input.files }
    },
    log: () => {},
  })
  assert.equal(code, 0)
  assert.deepEqual(refs, [null, 'origin/develop'])
})

test('an unreadable base ref prints one line naming it and exits 1', () => {
  const lines = []
  const input = state({ when: [10] })
  const code = main(['--base', 'origin/develop'], {
    load: (ref) => {
      if (ref !== null) throw new Error('fatal: invalid object name')
      return { journal: input.journal, files: input.files }
    },
    log: (line) => lines.push(line),
  })
  assert.equal(code, 1)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /origin\/develop/)
})

test('a call without a form prints the usage and exits 64', () => {
  const lines = []
  assert.equal(main([], { log: (line) => lines.push(line) }), 64)
  assert.match(lines[0], /Usage: check-migrations\.mjs --base <ref> \| --merge-base <ref>/)
  assert.equal(main(['--merge-base'], { log: () => {} }), 64)
})

/** A real repository in a temporary directory, on a branch `base` with the migrations of `tags`. */
function repository(tags) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'check-migrations-')))
  fixtures.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'base')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '/dev/null')
  const directory = join(root, 'packages/db/drizzle')
  mkdirSync(join(directory, 'meta'), { recursive: true })

  /** Commits the migrations of `next`, the whole list, and only those. */
  const commit = (next, message) => {
    git('rm', '-q', '-r', '--ignore-unmatch', 'packages/db/drizzle')
    mkdirSync(join(directory, 'meta'), { recursive: true })
    const { journal, files } = side(
      next.map((_, idx) => (idx + 1) * 10),
      next,
    )
    writeFileSync(join(directory, 'meta/_journal.json'), JSON.stringify({ entries: journal }))
    for (const [tag, sql] of files) writeFileSync(join(directory, `${tag}.sql`), sql)
    git('add', 'packages/db/drizzle')
    git('commit', '-q', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }

  const check = (...argv) => {
    const lines = []
    const code = main(argv, { root, log: (line) => lines.push(line) })
    return { code, lines }
  }
  commit(tags, 'start')
  return { git, commit, check }
}

test('--merge-base lets a branch behind its base pass, with a newer migration on the base', () => {
  const { git, commit, check } = repository(['0000_a'])
  git('checkout', '-q', '-b', 'feature')
  commit(['0000_a'], 'no migration')
  git('checkout', '-q', 'base')
  commit(['0000_a', '0001_b'], 'a teammate merges a migration')
  git('checkout', '-q', 'feature')

  assert.deepEqual(check('--merge-base', 'base'), { code: 0, lines: [] })
})

test('--merge-base refuses a branch that removes a merged migration', () => {
  const { git, commit, check } = repository(['0000_a', '0001_b'])
  git('checkout', '-q', '-b', 'feature')
  commit(['0000_a'], 'removes the merged migration')

  const { code, lines } = check('--merge-base', 'base')

  assert.equal(code, 1)
  assert.match(lines.join('\n'), /0001_b.*never removed or reordered/)
})

test('--base compares with exactly its ref, as a branch behind it shows', () => {
  const { git, commit, check } = repository(['0000_a'])
  git('checkout', '-q', '-b', 'feature')
  commit(['0000_a'], 'no migration')
  git('checkout', '-q', 'base')
  commit(['0000_a', '0001_b'], 'a teammate merges a migration')
  git('checkout', '-q', 'feature')

  const { code, lines } = check('--base', 'base')

  assert.equal(code, 1)
  assert.match(lines.join('\n'), /0001_b.*never removed or reordered/)
})

test('--base still refuses what a force-push dropped, whose merge base lacks it', () => {
  const { git, commit, check } = repository(['0000_a'])
  const parent = git('rev-parse', 'HEAD')
  const before = commit(['0000_a', '0001_b'], 'merges a migration')
  git('reset', '-q', '--hard', parent)
  commit(['0000_a'], 'the force-pushed commit, without that migration')

  assert.equal(check('--merge-base', before).code, 0)
  const { code, lines } = check('--base', before)
  assert.equal(code, 1)
  assert.match(lines.join('\n'), /0001_b.*never removed or reordered/)
})

test('--merge-base refuses a ref it cannot resolve, naming it', () => {
  const { check } = repository(['0000_a'])

  const { code, lines } = check('--merge-base', 'origin/does-not-exist-anywhere')

  assert.equal(code, 1)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /origin\/does-not-exist-anywhere/)
})

test('--merge-base refuses a ref with no history in common', () => {
  const { git, check } = repository(['0000_a'])
  git('checkout', '-q', '--orphan', 'unrelated')
  git('commit', '-q', '-m', 'no shared history')

  const { code, lines } = check('--merge-base', 'base')

  assert.equal(code, 1)
  assert.match(lines[0], /base/)
})

test('the pre-push hook compares with the merge base, and CI does not', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

  assert.match(read('../lefthook.yml'), /check-migrations\.mjs --merge-base origin\/develop/)
  assert.doesNotMatch(read('../.github/workflows/ci.yml'), /--merge-base/)
})
