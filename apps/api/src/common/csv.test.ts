import { describe, expect, it } from 'vitest'
import { amountCell, csvFile } from './csv'

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

  // docs/specs/0010-sales-reports.md, E6: an amount is a number, to the cent, with the decimal
  // mark of the language the file is written in, which a spreadsheet set to it reads as one.
  it('writes an amount of the minor unit as a number with two decimals', () => {
    expect(
      csvFile([[amountCell(12345, 'en'), amountCell(10000, 'en'), amountCell(150, 'pl')]]),
    ).toBe('\uFEFF123.45;100.00;1,50\r\n')
    expect(csvFile([[amountCell(-1200, 'pl'), amountCell(5, 'en')]])).toBe('\uFEFF-12,00;0.05\r\n')
    // The mark is the language's own, whichever language a file is asked for in.
    expect(csvFile([[amountCell(12345, 'de'), amountCell(12345, 'en-GB')]])).toBe(
      '\uFEFF123,45;123.45\r\n',
    )
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
