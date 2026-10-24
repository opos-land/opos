import { describe, expect, it } from 'vitest'
import { parsePo, pl } from './catalog'

describe('the pl catalog of an application', () => {
  it('reads the translated messages of a .po file by their source text', () => {
    const messages = parsePo(
      [
        'msgid ""',
        'msgstr ""',
        '"Language: pl\\n"',
        '',
        '#: src/a.tsx',
        'msgid "Sign out"',
        'msgstr "Translated sign-out"',
        '',
        'msgctxt "menu"',
        'msgid "Open"',
        'msgstr "Translated open"',
        '',
        'msgid ""',
        '"A long message "',
        '"that wraps"',
        'msgstr ""',
        '"A long translation "',
        '"that wraps"',
        '',
        'msgid "Quoted \\"name\\""',
        'msgstr "Translated \\"name\\""',
        'msgid "Untranslated"',
        'msgstr ""',
      ].join('\n'),
    )

    expect(Object.fromEntries(messages)).toEqual({
      'Sign out': 'Translated sign-out',
      'menu\u0004Open': 'Translated open',
      'A long message that wraps': 'A long translation that wraps',
      'Quoted "name"': 'Translated "name"',
    })
  })

  it('gives the translation of a message from the application catalog', () => {
    expect(pl('panel', 'Editions')).not.toBe('Editions')
    expect(pl('portal', 'Sign out')).not.toBe('Sign out')
  })

  it('refuses a message the catalog does not translate', () => {
    expect(() => pl('portal', 'No such message in the catalog')).toThrow(/no pl translation/)
  })
})
