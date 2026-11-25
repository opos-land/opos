import { type Locale } from '@opos/i18n'
import { SERVER_HEAD } from '../shared/lib/server-head'
import { formatTitle, joinTitle } from '../shared/lib/title'

/** A picture a preview of the page shows: its address, and what it shows. */
export interface HeadImage {
  url: string
  alt: string
}

/** What the head of a page's document says of the page. */
export interface PageHead {
  /** 404 for a page that is not there. */
  status: 200 | 404
  /** The language of the head: the convention's on its pages, else the default one. */
  locale: Locale
  /** The portal's name, which ends every tab title. */
  application: string
  /** What names the page, most specific first; none for a page that says nothing of itself. */
  parts: readonly string[]
  description: string
  /** The page's own address under the portal's origin; none for a page that is not there. */
  path: string | null
  image: HeadImage | null
  /** Whether search engines are asked to leave the page out. */
  noIndex: boolean
}

/** The language of a head as Open Graph names it: with the territory whose spelling it follows. */
const OG_LOCALES = { en: 'en_GB', pl: 'pl_PL' } as const satisfies Record<Locale, string>

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Text as it stands inside an element or a quoted attribute, where it can open or close neither. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char]!)

/** Text on one line: a single space wherever it broke or held a control character. */
export const oneLine = (text: string) => text.replace(/[\s\p{Cc}]+/gu, ' ').trim()

/** Text on one line and within `max` characters, cut at a word and marked where it goes on. */
export function excerpt(text: string, max = 200) {
  const line = oneLine(text)
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  // A cut that ends a word keeps it; one inside a word goes back to the word before
  const word = line[max - 1] === ' ' ? cut.length : cut.lastIndexOf(' ')
  return `${(word > 0 ? cut.slice(0, word) : cut).trimEnd()}…`
}

const element = (name: 'meta' | 'link', attributes: Record<string, string>) => {
  const written = Object.entries(attributes).map(([key, value]) => `${key}="${escapeHtml(value)}"`)
  return `<${name} ${written.join(' ')} ${SERVER_HEAD}>`
}

const named = (name: string, content: string) => element('meta', { name, content })
const property = (name: string, content: string) => element('meta', { property: name, content })

/**
 * The elements of a page's head: its title as the page names itself in the tab, its description
 * and address for a search engine, and what a preview of a shared link reads. Every one but the
 * title is marked, so that the portal drops them when it shows another page.
 */
export function headTags(head: PageHead, origin: string) {
  const url = head.path === null ? null : `${origin.replace(/\/+$/, '')}${head.path}`
  return [
    `<title>${escapeHtml(formatTitle(head.parts, head.application))}</title>`,
    named('description', head.description),
    head.noIndex ? named('robots', 'noindex') : null,
    url ? element('link', { rel: 'canonical', href: url }) : null,
    property('og:site_name', head.application),
    property('og:type', 'website'),
    property('og:locale', OG_LOCALES[head.locale]),
    property('og:title', joinTitle(head.parts) || head.application),
    property('og:description', head.description),
    url ? property('og:url', url) : null,
    head.image ? property('og:image', head.image.url) : null,
    head.image ? property('og:image:alt', head.image.alt) : null,
    named('twitter:card', 'summary'),
  ]
    .filter((tag) => tag !== null)
    .join('\n    ')
}

const TITLE = /<title>[\s\S]*?<\/title>/i
const HEAD_END = /<\/head>/i
const LANGUAGE = /(<html\b[^>]*?\blang=")[^"]*(")/i

/**
 * The portal's document with the head of one page: in place of the document's own title, or at the
 * end of a head that has none, and with the language of the head as the document's. Written by
 * functions, so that nothing a convention wrote is read as a pattern of the replacement.
 */
export function fillDocument(html: string, head: PageHead, origin: string) {
  const tags = headTags(head, origin)
  const filled = TITLE.test(html)
    ? html.replace(TITLE, () => tags)
    : html.replace(HEAD_END, (end) => `${tags}\n  ${end}`)
  if (filled === html) return html
  return filled.replace(
    LANGUAGE,
    (_all, before: string, after: string) => `${before}${head.locale}${after}`,
  )
}
