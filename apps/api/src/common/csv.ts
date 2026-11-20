/** A cell of a file: a text, a number, or nothing. */
export type CsvCell = string | number | null

/** What a spreadsheet would run as a formula when a cell begins with it. */
const FORMULA = /^[=+\-@\t\r]/

/**
 * A text as a field: in quotes, a quote inside it doubled. One that begins like a formula gets a
 * leading apostrophe, so a text somebody typed never runs in a spreadsheet.
 */
const field = (cell: CsvCell): string => {
  if (typeof cell === 'number') return String(cell)
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
