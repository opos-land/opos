// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@tailwindcss/node'
import { describe, expect, it } from 'vitest'

const src = import.meta.dirname
const stylesheet = readFileSync(join(src, 'styles.css'), 'utf8')

/** The application's source files, tests and type declarations aside. */
const sources = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
  (path) => /\.tsx?$/.test(path) && !/\.(test|d)\.tsx?$/.test(path),
)

/** A utility that takes a color or a radius from the theme. */
const themed =
  /^-?(bg|text|border(-[xytrblse])?|outline|ring|ring-offset|divide|fill|stroke|decoration|caret|shadow|rounded(-[a-z]{1,2})?)-[a-z]/

/**
 * The utility of a class: its last segment, without variants or the important mark. A piece of
 * an arbitrary variant split off at a quote may close more brackets than it opens.
 */
function utilityOf(className: string) {
  let depth = 0
  let start = 0
  for (const [index, char] of [...className].entries()) {
    if (char === '[' || char === '(') depth++
    else if (char === ']' || char === ')') depth--
    else if (char === ':' && depth <= 0) start = index + 1
  }
  return className.slice(start).replace(/^!|!$/g, '')
}

/** Each themed utility the sources name, with the first file naming it. */
function themedUtilities() {
  const found = new Map<string, string>()
  for (const path of sources) {
    const code = readFileSync(join(src, path), 'utf8')
    for (const className of code.split(/[\s"'`{}<>;,]+/)) {
      const utility = utilityOf(className)
      // An arbitrary value names no token.
      if (themed.test(utility) && !utility.includes('[') && !found.has(utility)) {
        found.set(utility, path)
      }
    }
  }
  return found
}

describe('styles.css', () => {
  it('names its tokens as shadcn/ui components read them', () => {
    const tokens = [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
      'destructive',
      'border',
      'input',
      'ring',
      'radius',
    ]
    for (const token of tokens) expect(stylesheet).toMatch(new RegExp(`^\\s*--${token}:`, 'm'))
  })

  // Tailwind drops a class it cannot build without a word: a token renamed or removed, or a
  // default palette color, would leave its element unstyled.
  it('builds every color and radius utility the sources name', async () => {
    const compiler = await compile(stylesheet, { base: src, onDependency: () => {} })
    let css = compiler.build([])
    const unknown: string[] = []
    for (const [utility, path] of themedUtilities()) {
      const before = css
      css = compiler.build([utility])
      if (css === before) unknown.push(`${utility} (${path})`)
    }
    expect(unknown).toEqual([])
  })
})
