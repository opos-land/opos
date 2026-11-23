/**
 * The Polish letters WinAnsi lacks, given the codes 1 to 16 by the font's own differences, so a
 * demo document reads in Polish.
 */
const POLISH = [
  ['ą', 'aogonek'],
  ['ć', 'cacute'],
  ['ę', 'eogonek'],
  ['ł', 'lslash'],
  ['ń', 'nacute'],
  ['ś', 'sacute'],
  ['ź', 'zacute'],
  ['ż', 'zdotaccent'],
  ['Ą', 'Aogonek'],
  ['Ć', 'Cacute'],
  ['Ę', 'Eogonek'],
  ['Ł', 'Lslash'],
  ['Ń', 'Nacute'],
  ['Ś', 'Sacute'],
  ['Ź', 'Zacute'],
  ['Ż', 'Zdotaccent'],
] as const

/** The code of each letter beyond ASCII the page writes, Polish typography's marks among them. */
const CODES = new Map<string, number>([
  ...POLISH.map(([letter], index) => [letter, index + 1] as const),
  ['ó', 0xf3],
  ['Ó', 0xd3],
  ['–', 0x96],
  ['„', 0x84],
  ['”', 0x94],
])

const FONT = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [1 ${POLISH.map(([, glyph]) => `/${glyph}`).join(' ')}] >> >>`

/** A text of the page as the format writes it: its own marks escaped, a letter beyond ASCII by its code. */
const literal = (text: string) =>
  [...text]
    .map((letter) => {
      if (/^[\x20-\x7e]$/.test(letter)) return letter.replace(/[\\()]/g, '\\$&')
      const code = CODES.get(letter)
      if (code === undefined) {
        throw new Error(`A demo PDF holds ASCII and the Polish letters alone: ${text}`)
      }
      return `\\${code.toString(8).padStart(3, '0')}`
    })
    .join('')

/**
 * A one-page PDF of a title and lines of text, in a font every reader has: the file of a demo
 * convention's legal document in the seed. The same text gives the same bytes.
 */
export function demoPdf(title: string, lines: readonly string[]): Buffer {
  const page = [
    `BT /F1 18 Tf 72 770 Td (${literal(title)}) Tj ET`,
    ...lines.map(
      (line, index) => `BT /F1 11 Tf 72 ${736 - index * 16} Td (${literal(line)}) Tj ET`,
    ),
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(page, 'latin1')} >>\nstream\n${page}\nendstream`,
    FONT,
  ]
  let file = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(file, 'latin1'))
    file += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const table = Buffer.byteLength(file, 'latin1')
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  file += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${table}\n%%EOF\n`
  return Buffer.from(file, 'latin1')
}
