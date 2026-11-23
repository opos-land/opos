import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const FEATURES = join(import.meta.dirname, '../features')

// Every module in a feature's pages/ directory is a page; its tests are not.
const pages = readdirSync(FEATURES).flatMap((feature) => {
  const dir = join(FEATURES, feature, 'pages')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
    .map((file) => join(feature, 'pages', file))
})

describe('pages', () => {
  it('are found', () => {
    expect(pages.length).toBeGreaterThan(0)
  })

  it.each(pages)('%s names itself in the browser tab', (page) => {
    expect(readFileSync(join(FEATURES, page), 'utf8')).toMatch(/\busePageTitle\(/)
  })
})

// A new entity is added on a page of its own (docs/ARCHITECTURE.md, Frontends): a mutation that
// creates one, named `create…Options` by the api modules, is used by a page routed at `new` alone.
const router = readFileSync(join(import.meta.dirname, 'router.tsx'), 'utf8')
const addingPages = new Set(
  [...router.matchAll(/path: '[^']*\/?new',\s*element: <(\w+) /g)].map((route) => route[1]),
)

/** Every module of a feature but its api and its tests, with the components it exports. */
const modules = (dir: string): { file: string; source: string }[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'api' ? [] : modules(path)
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return []
    return [{ file: relative(FEATURES, path), source: readFileSync(path, 'utf8') }]
  })

describe('adding an entity', () => {
  it('has pages routed at new', () => {
    expect(addingPages.size).toBeGreaterThan(0)
  })

  it('happens on a page routed at new alone', () => {
    const elsewhere = modules(FEATURES)
      .filter(({ source }) => /\bcreate[A-Z]\w*Options\(/.test(source))
      .filter(
        ({ source }) =>
          ![...source.matchAll(/export function (\w+)/g)].some((made) => addingPages.has(made[1])),
      )
      .map(({ file }) => file)

    expect(elsewhere).toEqual([])
  })
})
