import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkMigrations, main } from './check-migrations.mjs'

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

test('removing a base migration is refused', () => {
  const problems = checkMigrations(state({ when: [10], baseWhen: [10, 20] }))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001_b.*base/)
})

test('reordering base migrations is refused once, at the first position that differs', () => {
  const problems = checkMigrations(
    state({ when: [10, 20], tags: ['0001_b', '0000_a'], baseTags: ['0000_a', '0001_b'] }),
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0000_a.*position 0.*0001_b/)
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

test('a call without --base prints the usage and exits 64', () => {
  const lines = []
  assert.equal(main([], { log: (line) => lines.push(line) }), 64)
  assert.match(lines[0], /Usage: check-migrations\.mjs --base <ref>/)
})
