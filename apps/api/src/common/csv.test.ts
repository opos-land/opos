import { describe, expect, it } from 'vitest'
import { csvFile } from './csv'

// A file a spreadsheet opens as columns (docs/specs/0010-sales-reports.md, the exports): CSV in
// UTF-8 with a byte order mark, its fields quoted and separated by semicolons.
describe('csvFile', () => {
  it('starts with a byte order mark, quotes every field and ends every row', () => {
    expect(
      csvFile([
        ['Item', 'Paid'],
        ['Pin', 2],
      ]),
    ).toBe('\uFEFF"Item";"Paid"\r\n"Pin";2\r\n')
  })

  it('writes a number as a number, and nothing for no value', () => {
    expect(csvFile([[0, -5, 12.5, null, '']])).toBe('\uFEFF0;-5;12.5;"";""\r\n')
  })

  it('doubles a quote inside a field, and keeps a semicolon and a line break inside it', () => {
    expect(csvFile([['A "big" one', 'a;b', 'two\nlines']])).toBe(
      '\uFEFF"A ""big"" one";"a;b";"two\nlines"\r\n',
    )
  })

  // A text somebody typed never runs as a formula in a spreadsheet.
  it.each(['=1+1', '+48 600', '-5', '@name', '\tx', '\rx'])(
    'writes %j with a leading apostrophe',
    (text) => {
      expect(csvFile([[text]])).toBe(`\uFEFF"'${text}"\r\n`)
    },
  )

  it('is a byte order mark alone for no row', () => {
    expect(csvFile([])).toBe('\uFEFF')
  })
})
