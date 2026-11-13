#!/usr/bin/env node
// The spacing of Markdown tables (AGENTS.md, Document style): the columns of a pipe table are
// padded to one width, so a table reads the same in the source and rendered. Only whitespace and
// the dashes of the delimiter row change; a cell's text never does.
//
//   (no argument)   every Markdown file git tracks in the repository, checked
//   <file>...       only those of the given files that end in .md (lefthook)
//   --write         rewrite the files whose tables are not spaced instead of failing on them
//
// A table with a row of another number of cells than its header is named and left untouched, in
// every mode, and makes the exit code 1.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEGMENTER = new Intl.Segmenter()
const FENCE = /^ {0,3}(`{3,}|~{3,})/
const DELIMITER_CELL = /^:?-+:?$/
const ALIGNMENT = { '00': 'none', 10: 'left', '01': 'right', 11: 'center' }

/** The number of grapheme clusters of `text`. */
const width = (text) => [...SEGMENTER.segment(text)].length

/** The line that closes a fence opened by `marker`. */
const closer = (marker) => new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*$`)

/**
 * The indentation, the trimmed cells and whether an unescaped pipe is in `line`; a backslash
 * takes the next character with it, and a pipe in a code span splits like any other.
 */
export function splitRow(line) {
  const indent = /^\s*/.exec(line)[0]
  const segments = ['']
  for (const [token] of line
    .slice(indent.length)
    .trimEnd()
    .matchAll(/\\.|\||[^\\|]+|\\/g)) {
    if (token === '|') segments.push('')
    else segments[segments.length - 1] += token
  }
  const hasPipe = segments.length > 1
  if (segments[0] === '') segments.shift()
  if (segments.at(-1) === '') segments.pop()
  return { indent, cells: segments.map((cell) => cell.trim()), hasPipe }
}

/** The text of a cell padded to `size` by its alignment. */
function pad(text, size, align) {
  const extra = size - width(text)
  const before = { none: 0, left: 0, right: extra, center: Math.floor(extra / 2) }[align]
  return ' '.repeat(before) + text + ' '.repeat(extra - before)
}

/** The cell of the delimiter row for a column of `size` and its alignment. */
const rule = (size, align) =>
  ({
    none: '-'.repeat(size),
    left: `:${'-'.repeat(size - 1)}`,
    right: `${'-'.repeat(size - 1)}:`,
    center: `:${'-'.repeat(size - 2)}:`,
  })[align]

/**
 * The text with its pipe tables spaced, the header line (from 1) of each table that is
 * well-formed with whether it was spaced already, and the rows (line from 1) whose number of
 * cells differs from their header's; such a table is left as it is.
 */
export function spaceTables(source) {
  const lines = source.split('\n')
  const out = [...lines]
  const tables = []
  const malformed = []
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    if (fence) {
      if (fence.test(lines[i])) fence = null
      continue
    }
    const opener = FENCE.exec(lines[i])
    if (opener) {
      fence = closer(opener[1])
      continue
    }
    const header = splitRow(lines[i])
    const delimiter = splitRow(lines[i + 1] ?? '')
    const count = header.cells.length
    if (
      !header.hasPipe ||
      count === 0 ||
      !delimiter.hasPipe ||
      delimiter.cells.length !== count ||
      !delimiter.cells.every((cell) => DELIMITER_CELL.test(cell))
    ) {
      continue
    }
    let end = i + 2
    while (splitRow(lines[end] ?? '').hasPipe) end++
    const rows = [header, ...lines.slice(i + 2, end).map(splitRow)]
    const wrong = rows.flatMap((row, r) =>
      row.cells.length === count
        ? []
        : [{ line: i + r + 2, found: row.cells.length, expected: count }],
    )
    if (wrong.length > 0) {
      malformed.push(...wrong)
    } else {
      const aligns = delimiter.cells.map(
        (cell) => ALIGNMENT[`${+cell.startsWith(':')}${+cell.endsWith(':')}`],
      )
      const sizes = aligns.map((_, c) => Math.max(3, ...rows.map((row) => width(row.cells[c]))))
      const format = (cells) => `${header.indent}| ${cells.join(' | ')} |`
      const body = (row) => format(row.cells.map((cell, c) => pad(cell, sizes[c], aligns[c])))
      const formatted = [
        body(header),
        format(sizes.map((size, c) => rule(size, aligns[c]))),
        ...rows.slice(1).map(body),
      ]
      tables.push({ line: i + 1, spaced: formatted.every((line, k) => line === lines[i + k]) })
      out.splice(i, formatted.length, ...formatted)
    }
    i = end - 1
  }
  return { text: out.join('\n'), tables, malformed }
}

/** The tracked Markdown files of the repository holding `cwd` that exist: [shown, path] pairs. */
function tracked(cwd) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim()
  return execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path && existsSync(join(root, path)))
    .map((path) => [path, join(root, path)])
}

/**
 * Runs one mode from `cwd`. Returns the exit code: 1 for a table not spaced (check) or malformed
 * (both modes), or for a check that could not run.
 */
export function main(args, { cwd }) {
  try {
    const write = args.includes('--write')
    const given = args.filter((arg) => !arg.startsWith('--'))
    const targets =
      given.length > 0
        ? given.filter((arg) => arg.endsWith('.md')).map((arg) => [arg, resolve(cwd, arg)])
        : tracked(cwd)
    let unspaced = 0
    let broken = 0
    for (const [shown, path] of targets) {
      const source = readFileSync(path, 'utf8')
      const { text, tables, malformed } = spaceTables(source)
      for (const { line, found, expected } of malformed) {
        console.error(`${shown}:${line}: a row has ${found} cells where the header has ${expected}`)
      }
      broken += malformed.length
      const pending = write ? [] : tables.filter((table) => !table.spaced)
      for (const { line } of pending) console.error(`${shown}:${line}: the table is not spaced`)
      unspaced += pending.length
      if (write && text !== source) {
        writeFileSync(path, text)
        console.log(shown)
      }
    }
    if (unspaced > 0) {
      console.error(
        'Space the tables with pnpm format, or node scripts/markdown-tables.mjs --write <file> (AGENTS.md, Document style).',
      )
    }
    return unspaced + broken > 0 ? 1 : 0
  } catch (error) {
    console.error(`markdown-tables could not check the tables: ${error.message}`)
    return 1
  }
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), { cwd: process.cwd() })
}
