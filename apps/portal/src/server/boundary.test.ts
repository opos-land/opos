// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// src/server runs in Node, beside the portal and never in the browser: no module of the portal
// itself imports it, and it takes from the portal only what runs without a browser
// (docs/ARCHITECTURE.md, Frontends).

const SRC = join(import.meta.dirname, '..')

const sources = (dir: string) =>
  readdirSync(join(SRC, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file))

const read = (file: string) => readFileSync(join(SRC, file), 'utf8')

const imports = (source: string) =>
  [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]!)

/** What the server takes from the portal's own layers: modules with no browser in them. */
const SHARED = ['../shared/lib/server-head', '../shared/lib/title']

describe('the server beside the portal', () => {
  const browser = [...sources('app'), ...sources('features'), ...sources('shared'), 'main.tsx']
  const server = sources('server')

  it('finds the sources', () => {
    expect(browser.length).toBeGreaterThan(0)
    expect(server.length).toBeGreaterThan(0)
  })

  it('is imported by no module of the portal that runs in the browser', () => {
    const importing = browser.filter((file) =>
      imports(read(file)).some((path) => /(^|\/)server(\/|$)/.test(path)),
    )

    expect(importing).toEqual([])
  })

  it('imports nothing of the portal but the modules that run without a browser', () => {
    const taken = server.flatMap((file) =>
      imports(read(file))
        .filter((path) => /^\.\.\/(app|features|shared)\//.test(path) && !SHARED.includes(path))
        .map((path) => `${file}: ${path}`),
    )

    expect(taken).toEqual([])
  })
})
