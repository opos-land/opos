// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The admin application reaches every tenant and holds no tracker (docs/ARCHITECTURE.md, Frontends).

const APP = join(import.meta.dirname, '../..')
const SRC = join(APP, 'src')

const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
const code = files.filter((file) => /\.tsx?$/.test(file) && !/\.(test|d)\.tsx?$/.test(file))
const stylesheets = files.filter((file) => file.endsWith('.css'))

const read = (file: string) => readFileSync(join(SRC, file), 'utf8')

const CREATES = /createElement\(\s*['"`](script|iframe|embed|object)\b/i
const RENDERS = /<(script|iframe|embed|object)\b/i
const FOREIGN_ATTRIBUTE = /\b(src|href)\s*=\s*["'](https?:)?\/\//i
const FOREIGN_IMPORT = /(url\(|@import)\s*["']?(https?:)?\/\//i

describe('third-party code', () => {
  it('finds the sources', () => {
    expect(code.length).toBeGreaterThan(0)
  })

  it('is never added to the page', () => {
    expect(code.filter((file) => CREATES.test(read(file)))).toEqual([])
  })

  it('is never rendered as an element', () => {
    expect(code.filter((file) => RENDERS.test(read(file)))).toEqual([])
  })

  it('is not loaded by index.html, which starts the admin application alone', () => {
    const html = readFileSync(join(APP, 'index.html'), 'utf8')
    expect(html).not.toMatch(FOREIGN_ATTRIBUTE)
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="module" src="/src/main.tsx">'])
    expect(html).not.toMatch(/<(iframe|embed|object)\b/i)
  })

  it('is not imported by a stylesheet, a font included', () => {
    expect(stylesheets.length).toBeGreaterThan(0)
    expect(stylesheets.filter((file) => FOREIGN_IMPORT.test(read(file)))).toEqual([])
  })
})
