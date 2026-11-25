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

  // A family no @font-face of the stylesheet declares falls back to whatever the visitor's system
  // holds, and one without Polish letters mixes two fonts in a Polish word.
  it('loads every font family its tokens name, with the Polish letters', async () => {
    const compiler = await compile(stylesheet, { base: src, onDependency: () => {} })
    const css = compiler.build([])
    const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body = '']) => ({
      family: /font-family:\s*['"]?([^'";]+)/.exec(body)?.[1],
      ranges: (/unicode-range:\s*([^;]+)/.exec(body)?.[1] ?? 'U+0-10FFFF').split(','),
    }))
    const covers = (range: string, codePoint: number) => {
      const [, from = '', to = from] = /U\+([0-9a-f]+)(?:-([0-9a-f]+))?/i.exec(range) ?? []
      return codePoint >= parseInt(from, 16) && codePoint <= parseInt(to, 16)
    }
    const tokens = [...stylesheet.matchAll(/^\s*--font-(sans|serif|mono):\s*['"]?([^'",;]+)/gm)]
    expect(new Set(tokens.map(([, token]) => token))).toEqual(new Set(['sans', 'serif', 'mono']))
    for (const family of new Set(tokens.map(([, , family]) => family))) {
      const own = faces.filter((face) => face.family === family)
      expect(own, family).not.toEqual([])
      for (const letter of 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ') {
        const codePoint = letter.codePointAt(0)!
        expect(
          own.some((face) => face.ranges.some((range) => covers(range, codePoint))),
          `${family} ${letter}`,
        ).toBe(true)
      }
    }
  })

  // WCAG 2.1 AA asks 4.5:1 of text (docs/PRODUCT.md, Design and public image). `text-primary`
  // reads `--text-color-primary` before `--color-primary`, so a link can be darker than a button.
  it('keeps every text token at 4.5:1 against the surface it sits on, in both themes', async () => {
    const compiler = await compile(stylesheet, { base: src, onDependency: () => {} })
    expect(compiler.build(['text-primary'])).toMatch(
      /\.text-primary\s*{\s*color: var\(--primary-text\)/,
    )

    const block = (selector: string) =>
      Object.fromEntries(
        [
          ...(stylesheet.split(`\n${selector} {`)[1]?.split('\n}')[0] ?? '').matchAll(
            /--([\w-]+):\s*([^;]+);/g,
          ),
        ].map(([, name = '', value = '']) => [name, value]),
      )
    const light = block(':root')
    const themes = { light, dark: { ...light, ...block('.dark') } }

    /** The linear sRGB channels of an `oklch(L C h)` token. */
    const linear = (tokens: Record<string, string>, name: string) => {
      let value = tokens[name] ?? ''
      for (let reference; (reference = /^var\(--([\w-]+)\)$/.exec(value));)
        value = tokens[reference[1] ?? ''] ?? ''
      const [l = NaN, c = NaN, h = NaN] = (/^oklch\(([^)/]+)\)$/.exec(value)?.[1] ?? '')
        .trim()
        .split(/\s+/)
        .map(Number)
      const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]
      const lms = [
        l + 0.3963377774 * a + 0.2158037573 * b,
        l - 0.1055613458 * a - 0.0638541728 * b,
        l - 0.0894841775 * a - 1.291485548 * b,
      ].map((x) => x ** 3)
      const [x = 0, y = 0, z = 0] = lms
      return [
        4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
        -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
        -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
      ].map((channel) => Math.min(1, Math.max(0, channel)))
    }

    const encode = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055)
    const decode = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)

    /**
     * The relative luminance of a token, or of `token/percent`: the token at that opacity over the
     * background, as a utility such as `hover:bg-primary/80` paints it.
     */
    const luminance = (tokens: Record<string, string>, surface: string) => {
      const [name = '', percent] = surface.split('/')
      let rgb = linear(tokens, name)
      if (percent !== undefined) {
        const alpha = Number(percent) / 100
        const under = linear(tokens, 'background')
        rgb = rgb.map((u, i) => decode(alpha * encode(u) + (1 - alpha) * encode(under[i] ?? 0)))
      }
      const [r = 0, g = 0, b = 0] = rgb
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    // The translucent fills are those of shadcn/ui's buttons and badges and their hovers; a third
    // entry names the one theme that paints the fill.
    const pairs = [
      ['foreground', 'background'],
      ['card-foreground', 'card'],
      ['popover-foreground', 'popover'],
      ['primary-foreground', 'primary'],
      ['primary-foreground', 'primary/80'],
      ['primary-text', 'background'],
      ['primary-text', 'card'],
      ['secondary-foreground', 'secondary'],
      ['secondary-foreground', 'secondary/80'],
      ['muted-foreground', 'background'],
      ['muted-foreground', 'muted'],
      ['accent-foreground', 'accent'],
      ['destructive', 'background'],
      ['destructive', 'card'],
      ['destructive', 'destructive/10', 'light'],
      ['destructive', 'destructive/20'],
      ['destructive', 'destructive/30', 'dark'],
      ['sidebar-foreground', 'sidebar'],
      ['sidebar-primary-foreground', 'sidebar-primary'],
      ['sidebar-accent-foreground', 'sidebar-accent'],
    ]
    const short: string[] = []
    for (const [theme, tokens] of Object.entries(themes)) {
      for (const [text = '', surface = '', only = theme] of pairs) {
        if (only !== theme) continue
        const [high, low] = [luminance(tokens, text), luminance(tokens, surface)].sort(
          (p, q) => q - p,
        )
        const ratio = ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
        if (!(ratio >= 4.5)) short.push(`${theme} ${text} on ${surface}: ${ratio.toFixed(2)}`)
      }
    }
    expect(short).toEqual([])
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
