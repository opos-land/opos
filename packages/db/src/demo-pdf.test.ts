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

  it('refuses text outside the letters its font holds', () => {
    expect(() => demoPdf('Zażółć', [])).toThrow(/ASCII/)
  })
})
