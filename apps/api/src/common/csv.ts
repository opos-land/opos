/** A cell of a file: a text, a number, a number written out already, or nothing. */
export type CsvCell = string | number | null | { written: string }

/**
 * An amount of the minor unit as a number to the cent, with the decimal mark of the language the
 * file is written in: a spreadsheet set to that language reads it as a number, and never as a
 * date, as it would a dot in a language that writes a comma.
 */
export const amountCell = (amountMinor: number, locale: string): CsvCell => {
  const whole = Math.trunc(Math.abs(amountMinor) / 100)
  const cents = String(Math.abs(amountMinor) % 100).padStart(2, '0')
  return { written: `${amountMinor < 0 ? '-' : ''}${whole}${locale === 'pl' ? ',' : '.'}${cents}` }
}

/** What a spreadsheet would run as a formula when a cell begins with it. */
const FORMULA = /^[=+\-@\t\r]/

/**
 * A text as a field: in quotes, a quote inside it doubled. One that begins like a formula gets a
 * leading apostrophe, so a text somebody typed never runs in a spreadsheet.
 */
const field = (cell: CsvCell): string => {
  if (typeof cell === 'number') return String(cell)
  if (cell !== null && typeof cell === 'object') return cell.written
  const text = cell ?? ''
  return `"${(FORMULA.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`
}

/**
 * A file a spreadsheet opens as columns (docs/specs/0010-sales-reports.md, the exports): CSV in
 * UTF-8 with a byte order mark, its texts quoted, its fields separated by semicolons and its rows
 * ended by a carriage return and a line feed. It opens as columns in a spreadsheet set to Polish
 * and imports cleanly into any other.
 */
export const csvFile = (rows: readonly (readonly CsvCell[])[]): string =>
  `\uFEFF${rows.map((row) => `${row.map(field).join(';')}\r\n`).join('')}`
