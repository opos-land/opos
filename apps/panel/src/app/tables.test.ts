import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const FEATURES = join(import.meta.dirname, '../features')

/** Every module of the features but their tests. */
const modules = (dir: string): { file: string; source: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return modules(path)
    if (!entry.name.endsWith('.tsx') || entry.name.includes('.test.')) return []
    return [{ file: relative(FEATURES, path), source: readFileSync(path, 'utf8') }]
  })

const all = modules(FEATURES)
const cells = (source: string) =>
  [...source.matchAll(/<TableCell\b[^>]*>([\s\S]*?)<\/TableCell>/g)].map((cell) => cell[1] ?? '')

// A table row whose entity has a page of its own opens that page from anywhere in it
// (docs/ARCHITECTURE.md, Frontends): the row is a `LinkRow` and its link a `RowLink`, never a
// plain link in one cell.
describe('table rows', () => {
  it('are found', () => {
    expect(all.some(({ source }) => source.includes('<LinkRow'))).toBe(true)
  })

  it('never open a page by a plain link in one cell', () => {
    const plain = all
      .filter(({ source }) => cells(source).some((cell) => /<Link\b/.test(cell)))
      .map(({ file }) => file)

    expect(plain).toEqual([])
  })

  it('hold a row link only in a row that opens the same page', () => {
    const loose = all
      .filter(({ source }) => source.includes('<RowLink') && !source.includes('<LinkRow'))
      .map(({ file }) => file)

    expect(loose).toEqual([])
  })
})
