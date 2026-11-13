import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
