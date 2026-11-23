import { describe, expect, it } from 'vitest'
import { demoPdf } from './demo-pdf'

describe('a demo PDF', () => {
  const bytes = demoPdf('Shop terms', ['A demo document.', 'It binds nobody (really).'])
  const text = bytes.toString('latin1')

  it('is a PDF from its first byte to its last line', () => {
    expect(text.startsWith('%PDF-1.4\n')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('names in its table where each of its objects starts', () => {
    const table = /xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)/.exec(text)!
    const offsets = table[2]!
      .trim()
      .split('\n')
      .map((row) => Number(row.slice(0, 10)))

    expect(offsets).toHaveLength(Number(table[1]) - 1)
    for (const [index, offset] of offsets.entries()) {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true)
    }
    expect(Number(/startxref\n(\d+)\n/.exec(text)![1])).toBe(text.indexOf('xref\n'))
  })

  it('shows its title and its lines, with the marks of the format escaped', () => {
    expect(text).toContain('(Shop terms) Tj')
    expect(text).toContain('(A demo document.) Tj')
    expect(text).toContain('(It binds nobody \\(really\\).) Tj')
  })

  it('says how long its page is, in bytes', () => {
    const [, length, stream] = /\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(text)!

    expect(Buffer.byteLength(stream!, 'latin1')).toBe(Number(length))
  })

  it('is the same file for the same text, so that a second run of the seed changes nothing', () => {
    expect(
      demoPdf('Shop terms', ['A demo document.']).equals(
        demoPdf('Shop terms', ['A demo document.']),
      ),
    ).toBe(true)
    expect(demoPdf('Shop terms', ['A']).equals(demoPdf('Privacy policy', ['A']))).toBe(false)
  })

  it('shows the Polish letters, each as a byte its font names by the glyph', () => {
    const polish = demoPdf('Zażółć gęślą jaźń', ['ĄĆĘŁŃÓŚŹŻ']).toString('latin1')
    const font =
      /\/Encoding << \/BaseEncoding \/WinAnsiEncoding \/Differences \[(\d+) ([^\]]+)\] >>/.exec(
        polish,
      )!
    const glyphs = font[2]!
      .trim()
      .split(/\s+/)
      .map((name) => name.slice(1))
    const glyph = (code: string) => glyphs[parseInt(code, 8) - Number(font[1])]
    const shown = (line: string) =>
      line.replace(/\\(\d{3})/g, (_, code: string) =>
        parseInt(code, 8) === 0o363 ? 'ó' : parseInt(code, 8) === 0o323 ? 'Ó' : `[${glyph(code)}]`,
      )

    // Every byte of the file is ASCII: the letters beyond it are written by their codes.
    expect([...polish].every((letter) => letter.charCodeAt(0) < 0x80)).toBe(true)
    const [title, line] = [...polish.matchAll(/Td \((.*)\) Tj/g)].map((match) => shown(match[1]!))
    expect(title).toBe(
      'Za[zdotaccent]ó[lslash][cacute] g[eogonek][sacute]l[aogonek] ja[zacute][nacute]',
    )
    expect(line).toBe('[Aogonek][Cacute][Eogonek][Lslash][Nacute]Ó[Sacute][Zacute][Zdotaccent]')
  })

  it('refuses text outside the letters its font holds', () => {
    expect(() => demoPdf('Ж', [])).toThrow(/letters/)
    expect(() => demoPdf('A', ['€'])).toThrow(/letters/)
  })
})
