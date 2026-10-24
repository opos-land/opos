import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The `pl` rendering of a source message, read from the application's own `pl` catalog: the
// scenarios hold no Polish of their own, and a reworded translation never breaks them.

const CATALOGS = {
  panel: '../../apps/panel/src/locales/pl.po',
  portal: '../../apps/portal/src/locales/pl.po',
} as const

export type CatalogApp = keyof typeof CATALOGS

/** The key of a message: its context, when it has one, and its source text. */
const keyOf = (id: string, context?: string) => (context ? `${context}\u0004${id}` : id)

/**
 * The translated messages of a `.po` file by source text, the header and untranslated entries
 * left out. A field may continue on the lines below it, as gettext wraps long strings.
 */
export function parsePo(source: string): Map<string, string> {
  const messages = new Map<string, string>()
  let entry: { msgctxt?: string; msgid?: string; msgstr?: string } = {}
  let field: keyof typeof entry | undefined

  const flush = () => {
    if (entry.msgid && entry.msgstr) messages.set(keyOf(entry.msgid, entry.msgctxt), entry.msgstr)
    entry = {}
    field = undefined
  }

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    const start = /^(msgctxt|msgid|msgstr) (".*")$/.exec(line)
    if (start) {
      const name = start[1] as keyof typeof entry
      // A new msgctxt or msgid after a msgstr opens the next entry.
      if (name !== 'msgstr' && entry.msgstr !== undefined) flush()
      field = name
      entry[name] = JSON.parse(start[2]!) as string
    } else if (field && line.startsWith('"')) {
      entry[field] += JSON.parse(line) as string
    } else if (line === '' || line.startsWith('#')) {
      if (entry.msgstr !== undefined) flush()
    }
  }
  flush()
  return messages
}

const loaded = new Map<CatalogApp, Map<string, string>>()

function catalog(app: CatalogApp) {
  let messages = loaded.get(app)
  if (!messages) {
    const file = fileURLToPath(new URL(CATALOGS[app], import.meta.url))
    messages = parsePo(readFileSync(file, 'utf8'))
    loaded.set(app, messages)
  }
  return messages
}

/** The `pl` rendering of an English source message of the panel or the portal. */
export function pl(app: CatalogApp, message: string, context?: string): string {
  const translated = catalog(app).get(keyOf(message, context))
  if (!translated) throw new Error(`"${message}" has no pl translation in the ${app} catalog`)
  return translated
}
