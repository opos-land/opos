/** A text of the page as the format writes it: its own marks escaped. */
const literal = (text: string) => {
  if (!/^[\x20-\x7e]*$/.test(text))
    throw new Error(`A demo PDF holds printable ASCII alone: ${text}`)
  return text.replace(/[\\()]/g, '\\$&')
}

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
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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
