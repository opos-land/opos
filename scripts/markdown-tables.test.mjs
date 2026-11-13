import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, afterEach, beforeEach, describe, it, mock } from 'node:test'
import { main, spaceTables, splitRow } from './markdown-tables.mjs'

const fixtures = []
after(() => fixtures.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const lines = (...rows) => rows.join('\n')

describe('splitRow', () => {
  it('drops the outer pipes, trims the cells and keeps the indentation', () => {
    assert.deepEqual(splitRow('  | a |  b  |  '), {
      indent: '  ',
      cells: ['a', 'b'],
      hasPipe: true,
    })
    assert.equal(splitRow('\t| a |').indent, '\t')
  })

  it('reads a row without outer pipes', () => {
    assert.deepEqual(splitRow('a | b'), { indent: '', cells: ['a', 'b'], hasPipe: true })
  })

  it('reads a line without a pipe as one cell that has no pipe', () => {
    assert.deepEqual(splitRow('plain'), { indent: '', cells: ['plain'], hasPipe: false })
    assert.deepEqual(splitRow(''), { indent: '', cells: [], hasPipe: false })
  })

  it('keeps an escaped pipe in its cell', () => {
    assert.deepEqual(splitRow('| a\\|b | c |').cells, ['a\\|b', 'c'])
    assert.deepEqual(splitRow('a\\|b'), { indent: '', cells: ['a\\|b'], hasPipe: false })
  })

  it('splits at a pipe that follows an escaped backslash', () => {
    assert.deepEqual(splitRow('a\\\\| b').cells, ['a\\\\', 'b'])
  })

  it('keeps a trailing lone backslash', () => {
    assert.deepEqual(splitRow('a\\').cells, ['a\\'])
  })

  it('splits at a pipe inside a code span', () => {
    assert.deepEqual(splitRow('`a|b`').cells, ['`a', 'b`'])
  })

  it('counts empty cells', () => {
    assert.deepEqual(splitRow('||').cells, [''])
    assert.deepEqual(splitRow('| |').cells, [''])
    assert.deepEqual(splitRow('|a||').cells, ['a', ''])
    assert.deepEqual(splitRow('|').cells, [])
    assert.equal(splitRow('|').hasPipe, true)
  })
})

describe('spaceTables', () => {
  it('rewrites a table into the spaced form', () => {
    const { text, tables, malformed } = spaceTables(
      lines('| Type | When |', '|---|---|', '| `feat` | new feature |', ''),
    )

    assert.equal(
      text,
      lines('| Type   | When        |', '| ------ | ----------- |', '| `feat` | new feature |', ''),
    )
    assert.deepEqual(tables, [{ line: 1, spaced: false }])
    assert.deepEqual(malformed, [])
  })

  it('reports a table that is spaced already and leaves it as it is', () => {
    const source = lines(
      '| Type   | When        |',
      '| ------ | ----------- |',
      '| `feat` | new feature |',
    )
    const { text, tables } = spaceTables(source)

    assert.equal(text, source)
    assert.deepEqual(tables, [{ line: 1, spaced: true }])
  })

  it('numbers the header lines from 1 and keeps the other lines byte for byte', () => {
    const source = lines('intro  ', '', '| a |', '| - |', '| b |', '', 'x | y', 'outro', '')
    const { text, tables } = spaceTables(source)

    assert.equal(
      text,
      lines('intro  ', '', '| a   |', '| --- |', '| b   |', '', 'x | y', 'outro', ''),
    )
    assert.deepEqual(tables, [{ line: 3, spaced: false }])
  })

  it('finds several tables', () => {
    const { text, tables } = spaceTables(
      lines('| a |', '| --- |', '', '| b | c |', '|-|-|', '| 1 | 2 |'),
    )

    assert.equal(
      text,
      lines('| a   |', '| --- |', '', '| b   | c   |', '| --- | --- |', '| 1   | 2   |'),
    )
    assert.deepEqual(tables, [
      { line: 1, spaced: false },
      { line: 4, spaced: false },
    ])
  })

  it('aligns by the delimiter cells', () => {
    const { text } = spaceTables(lines('|a|b|c|d|', '|:-|-:|:-:|-|', '|1|2|3|4|'))

    assert.equal(
      text,
      lines('| a   |   b |  c  | d   |', '| :-- | --: | :-: | --- |', '| 1   |   2 |  3  | 4   |'),
    )
  })

  it('puts the spare space of a centered cell after the text', () => {
    const { text } = spaceTables(lines('| abcd |', '| :--: |', '| x |'))

    assert.equal(text, lines('| abcd |', '| :--: |', '|  x   |'))
  })

  it('widens a column to its longest cell, the header included', () => {
    const { text } = spaceTables(lines('| long header |', '| - |', '| x |'))

    assert.equal(text, lines('| long header |', '| ----------- |', '| x           |'))
  })

  it('measures cells in grapheme clusters', () => {
    const { text } = spaceTables(lines('| Sign | b |', '|-|-|', '| — | → |', '| é | ą |'))

    assert.equal(
      text,
      lines('| Sign | b   |', '| ---- | --- |', '| —    | →   |', '| é    | ą   |'),
    )
  })

  it('takes the indentation of the header for every row', () => {
    const { text, tables } = spaceTables(lines('  | a |', '| - |', '      | b |'))

    assert.equal(text, lines('  | a   |', '  | --- |', '  | b   |'))
    assert.deepEqual(tables, [{ line: 1, spaced: false }])
  })

  it('reads a table without outer pipes', () => {
    const { text } = spaceTables(lines('a | b', '--- | ---', '1 | 2'))

    assert.equal(text, lines('| a   | b   |', '| --- | --- |', '| 1   | 2   |'))
  })

  it('keeps an escaped pipe inside its cell', () => {
    const { text } = spaceTables(lines('| a\\|b | c |', '|-|-|'))

    assert.equal(text, lines('| a\\|b | c   |', '| ---- | --- |'))
  })

  it('ends the table at a blank line or at a line without a pipe', () => {
    const { text } = spaceTables(lines('| a |', '|-|', '| b |', 'text', '| c |', '', '| d |'))

    assert.equal(text, lines('| a   |', '| --- |', '| b   |', 'text', '| c |', '', '| d |'))
  })

  it('ends the table at the end of the file with no trailing newline', () => {
    const { text } = spaceTables(lines('| a |', '|-|', '| b |'))

    assert.equal(text, lines('| a   |', '| --- |', '| b   |'))
  })

  it('takes a header with no body rows for a table', () => {
    const { text } = spaceTables(lines('| a |', '|-|', ''))

    assert.equal(text, lines('| a   |', '| --- |', ''))
  })

  it('needs a delimiter row right below the header', () => {
    const source = lines(
      'a | b',
      '',
      '| a | b |',
      '| x | y |',
      '| a | b |',
      '| --- |',
      '| a |',
      '| -x- |',
      '|',
      '|-|',
      '| a |',
    )
    const { text, tables } = spaceTables(source)

    assert.equal(text, source)
    assert.deepEqual(tables, [])
  })

  it('does not take a header on the last line, or a header with no pipe, for a table', () => {
    const source = lines('text', '---', 'a | b')
    const { text, tables } = spaceTables(source)

    assert.equal(text, source)
    assert.deepEqual(tables, [])
  })

  it('does not take a delimiter row without a pipe', () => {
    const source = lines('| a |', '---')

    assert.equal(spaceTables(source).text, source)
  })

  it('leaves a table with a malformed row untouched and names the row', () => {
    const source = lines('| a | b |', '| - | - |', '| 1 |', '| 1 | 2 |', '| 1 | 2 | 3 |')
    const { text, tables, malformed } = spaceTables(source)

    assert.equal(text, source)
    assert.deepEqual(tables, [])
    assert.deepEqual(malformed, [
      { line: 3, found: 1, expected: 2 },
      { line: 5, found: 3, expected: 2 },
    ])
  })

  it('goes on after a malformed table', () => {
    const source = lines('| a | b |', '|-|-|', '| 1 |', '', '| c |', '|-|')
    const { text, tables, malformed } = spaceTables(source)

    assert.equal(text, lines('| a | b |', '|-|-|', '| 1 |', '', '| c   |', '| --- |'))
    assert.deepEqual(tables, [{ line: 5, spaced: false }])
    assert.equal(malformed.length, 1)
  })

  describe('fenced code blocks', () => {
    const table = lines('| a |', '|-|')
    const fixed = lines('| a   |', '| --- |')

    it('are skipped, with backticks or tildes', () => {
      for (const fence of ['```', '~~~', '````', '   ```js']) {
        const source = lines(fence, table, fence.trim().replace(/js$/, ''), '')

        assert.equal(spaceTables(source).text, source)
      }
    })

    it('hold no table to the end of the file when they are not closed', () => {
      const source = lines('```', table, table)

      assert.equal(spaceTables(source).text, source)
    })

    it('close at a fence of the same character, at least as long, with only spaces after it', () => {
      for (const closer of ['```', '````', '  ```', '```  ', '```\t']) {
        assert.equal(
          spaceTables(lines('```', table, closer, table)).text,
          lines('```', table, closer, fixed),
        )
      }
    })

    it('stay open at a shorter fence, another character, indentation of 4 or text after it', () => {
      for (const inner of ['```', '~~~~', '    ````', '```` x']) {
        const source = lines('````', inner, table)

        assert.equal(spaceTables(source).text, source)
      }
    })

    it('are not opened by a fence indented by 4 spaces', () => {
      assert.equal(spaceTables(lines('    ```', table)).text, lines('    ```', fixed))
    })

    it('keep a tilde fence open at a backtick fence', () => {
      const source = lines('~~~', '```', table)

      assert.equal(spaceTables(source).text, source)
    })
  })
})

/** A throwaway repository holding `files`, and the directory to run main in. */
function repo(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-tables-')))
  fixtures.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const write = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  for (const [path, content] of Object.entries(files)) write(path, content)
  const add = () => execFileSync('git', ['add', '--all'], { cwd: dir })
  return { dir, write, add }
}

const loose = lines('| a |', '| - |', '| b |', '')
const tidy = lines('| a   |', '| --- |', '| b   |', '')
const bad = lines('| a | b |', '| - | - |', '| 1 |', '')
const hint =
  'Space the tables with pnpm format, or node scripts/markdown-tables.mjs --write <file> (AGENTS.md, Document style).'

describe('main', () => {
  let errors
  let logs
  beforeEach(() => {
    errors = []
    logs = []
    mock.method(console, 'error', (message) => errors.push(String(message)))
    mock.method(console, 'log', (message) => logs.push(String(message)))
  })
  afterEach(() => mock.restoreAll())
  const run = (args, dir) => main(args, { cwd: dir })

  it('passes a repository whose tables are spaced, silently', () => {
    const { dir, add } = repo({ 'README.md': tidy, 'docs/a.md': tidy, 'b.txt': loose })
    add()

    assert.equal(run([], dir), 0)
    assert.deepEqual(errors, [])
    assert.deepEqual(logs, [])
  })

  it('checks the tracked Markdown from the top level, whatever the directory, and names each table', () => {
    const { dir, write, add } = repo({
      'docs/a.md': loose,
      'docs/b.txt': loose,
      'gone.md': loose,
      'top.md': lines('text', '', loose),
    })
    add()
    rmSync(join(dir, 'gone.md'))
    write('new.md', loose)

    assert.equal(run([], join(dir, 'docs')), 1)
    assert.deepEqual(errors, [
      'docs/a.md:1: the table is not spaced',
      'top.md:3: the table is not spaced',
      hint,
    ])
  })

  it('checks the files it is given, those ending in .md, relative to the directory it runs in', () => {
    const { dir } = repo({ 'docs/a.md': loose, 'docs/ok.md': tidy, 'docs/c.txt': loose })

    assert.equal(run(['a.md', 'c.txt', 'ok.md'], join(dir, 'docs')), 1)
    assert.deepEqual(errors, ['a.md:1: the table is not spaced', hint])
    assert.equal(run(['ok.md', 'c.txt', '--other'], join(dir, 'docs')), 0)
  })

  it('checks no file when it is given none that ends in .md', () => {
    const { dir } = repo({ 'a.md': loose })

    assert.equal(run(['c.txt'], dir), 0)
    assert.deepEqual(errors, [])
  })

  it('fails on a file it cannot read', () => {
    const { dir } = repo()

    assert.equal(run(['missing.md'], dir), 1)
    assert.match(errors.join('\n'), /^markdown-tables could not check the tables: /)
  })

  it('fails outside a repository when it is given no file', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'markdown-tables-none-')))
    fixtures.push(dir)

    assert.equal(run([], dir), 1)
    assert.match(errors.join('\n'), /^markdown-tables could not check the tables: /)
  })

  it('rewrites with --write, names the files it changed and leaves the others', () => {
    const { dir, write, add } = repo({ 'a.md': loose, 'docs/b.md': tidy, 'c.txt': loose })
    add()

    assert.equal(run(['--write'], dir), 0)
    assert.deepEqual(logs, ['a.md'])
    assert.equal(readFileSync(join(dir, 'a.md'), 'utf8'), tidy)
    assert.equal(readFileSync(join(dir, 'c.txt'), 'utf8'), loose)
    assert.deepEqual(errors, [])

    assert.equal(run(['--write'], dir), 0)
    assert.deepEqual(logs, ['a.md'])

    write('a.md', loose)
    assert.equal(run(['--write', 'a.md'], dir), 0)
    assert.deepEqual(logs, ['a.md', 'a.md'])
  })

  it('names a malformed row and fails in every mode, leaving the file alone', () => {
    const { dir } = repo({ 'bad.md': bad })
    const message = 'bad.md:3: a row has 1 cells where the header has 2'

    assert.equal(run(['bad.md'], dir), 1)
    assert.deepEqual(errors, [message])
    assert.equal(run(['--write', 'bad.md'], dir), 1)
    assert.deepEqual(errors, [message, message])
    assert.deepEqual(logs, [])
    assert.equal(readFileSync(join(dir, 'bad.md'), 'utf8'), bad)
  })

  it('still names an unspaced table next to a malformed one', () => {
    const { dir } = repo({ 'bad.md': bad, 'loose.md': loose })

    assert.equal(run(['bad.md', 'loose.md'], dir), 1)
    assert.deepEqual(errors, [
      'bad.md:3: a row has 1 cells where the header has 2',
      'loose.md:1: the table is not spaced',
      hint,
    ])
  })
})
