// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { escapeHtml, excerpt, fillDocument, headTags, oneLine, type PageHead } from './html'

const ORIGIN = 'https://opos.example'

const INDEX = `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <title>OPOS</title>
    <script type="module" src="/assets/index.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

const head = (changes: Partial<PageHead> = {}): PageHead => ({
  status: 200,
  locale: 'en',
  application: 'OPOS',
  parts: ['Programme', 'Convention A 2027'],
  description: 'Three days of games.',
  path: '/conventions/a/2027/program',
  image: null,
  noIndex: false,
  ...changes,
})

describe('escapeHtml', () => {
  it('leaves nothing that closes an attribute or opens an element', () => {
    expect(escapeHtml(`<b a="1" b='2'>&`)).toBe('&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;')
  })
})

describe('oneLine', () => {
  it('puts text on one line, with one space where it broke', () => {
    expect(oneLine('  First line\n\n\tsecond\u0000 line  ')).toBe('First line second line')
  })
})

describe('excerpt', () => {
  it('keeps a text that fits', () => {
    expect(excerpt('Short text', 20)).toBe('Short text')
  })

  it('cuts a longer one at a word and says it goes on', () => {
    expect(excerpt('One two three four five', 14)).toBe('One two three…')
  })

  it('cuts a single long word at the limit', () => {
    expect(excerpt('abcdefghijklmnop', 8)).toBe('abcdefg…')
  })

  it('never goes over the limit', () => {
    expect(excerpt('word '.repeat(100)).length).toBeLessThanOrEqual(200)
  })
})

describe('headTags', () => {
  it('names the page as the page names itself in the tab', () => {
    expect(headTags(head(), ORIGIN)).toContain(
      '<title>Programme · Convention A 2027 · OPOS</title>',
    )
  })

  it('names the application alone for a page that says nothing of itself', () => {
    const tags = headTags(head({ parts: [] }), ORIGIN)

    expect(tags).toContain('<title>OPOS</title>')
    expect(tags).toContain('<meta property="og:title" content="OPOS" data-server-head>')
  })

  it('describes the page to a search engine and to a preview', () => {
    const tags = headTags(head(), ORIGIN)

    expect(tags).toContain(
      '<meta name="description" content="Three days of games." data-server-head>',
    )
    expect(tags).toContain(
      '<meta property="og:description" content="Three days of games." data-server-head>',
    )
    expect(tags).toContain(
      '<meta property="og:title" content="Programme · Convention A 2027" data-server-head>',
    )
    expect(tags).toContain('<meta property="og:site_name" content="OPOS" data-server-head>')
    expect(tags).toContain('<meta property="og:type" content="website" data-server-head>')
    expect(tags).toContain('<meta name="twitter:card" content="summary" data-server-head>')
  })

  it("gives the page's own address under the portal's origin", () => {
    const tags = headTags(head(), `${ORIGIN}/`)

    expect(tags).toContain(
      '<link rel="canonical" href="https://opos.example/conventions/a/2027/program" data-server-head>',
    )
    expect(tags).toContain(
      '<meta property="og:url" content="https://opos.example/conventions/a/2027/program" data-server-head>',
    )
  })

  it('gives no address to a page that is not there', () => {
    const tags = headTags(head({ status: 404, path: null }), ORIGIN)

    expect(tags).not.toContain('canonical')
    expect(tags).not.toContain('og:url')
  })

  it('names the language as a preview reads it', () => {
    expect(headTags(head({ locale: 'pl' }), ORIGIN)).toContain(
      '<meta property="og:locale" content="pl_PL" data-server-head>',
    )
    expect(headTags(head({ locale: 'en' }), ORIGIN)).toContain(
      '<meta property="og:locale" content="en_GB" data-server-head>',
    )
  })

  it('shows a picture with what it shows, and none where the page has none', () => {
    const image = { url: 'https://api.opos.example/public/tenants/a/logo-files/1/large', alt: 'A' }
    const tags = headTags(head({ image }), ORIGIN)

    expect(tags).toContain(`<meta property="og:image" content="${image.url}" data-server-head>`)
    expect(tags).toContain('<meta property="og:image:alt" content="A" data-server-head>')
    expect(headTags(head(), ORIGIN)).not.toContain('og:image')
  })

  it('asks search engines to leave a page out only where the page says so', () => {
    expect(headTags(head({ noIndex: true }), ORIGIN)).toContain(
      '<meta name="robots" content="noindex" data-server-head>',
    )
    expect(headTags(head(), ORIGIN)).not.toContain('robots')
  })

  it('escapes what a convention wrote', () => {
    const tags = headTags(
      head({ parts: ['</title><script>alert(1)</script>'], description: '"><img src=x>' }),
      ORIGIN,
    )

    expect(tags).not.toContain('<script>')
    expect(tags).not.toContain('<img')
    expect(tags).toContain(
      '<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; · OPOS</title>',
    )
    expect(tags).toContain('content="&quot;&gt;&lt;img src=x&gt;"')
  })
})

describe('fillDocument', () => {
  it("puts the head in place of the document's own title, and keeps the rest", () => {
    const html = fillDocument(INDEX, head(), ORIGIN)

    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('<title>Programme · Convention A 2027 · OPOS</title>')
    expect(html).toContain('<meta charset="UTF-8" />')
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>')
    expect(html).toContain('<div id="root"></div>')
    expect(html.indexOf('og:title')).toBeLessThan(html.indexOf('</head>'))
  })

  it("names the language of the head as the document's", () => {
    expect(fillDocument(INDEX, head({ locale: 'en' }), ORIGIN)).toContain('<html lang="en">')
  })

  it('writes what a convention wrote as it stands, a replacement pattern included', () => {
    const html = fillDocument(INDEX, head({ parts: ["$& $' $1 $$"] }), ORIGIN)

    expect(html).toContain('<title>$&amp; $&#39; $1 $$ · OPOS</title>')
  })

  it('puts the head before the end of a head that has no title', () => {
    const html = fillDocument(
      '<html><head><meta charset="UTF-8" /></head><body></body></html>',
      head(),
      ORIGIN,
    )

    expect(html).toContain('<title>Programme · Convention A 2027 · OPOS</title>')
    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'))
  })

  it('leaves a document with no head as it is', () => {
    expect(fillDocument('<p>plain</p>', head(), ORIGIN)).toBe('<p>plain</p>')
  })
})
