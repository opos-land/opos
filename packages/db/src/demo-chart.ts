import { crc32, deflateSync } from 'node:zlib'

// The size chart of a demo item in the seed: an empty table drawn by this code. No image file
// enters the repository, and nothing here was drawn by a person or generated as a picture
// (docs/PRODUCT.md, 8. Design and public image).

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CELL = { width: 120, height: 48 }
const LINE = 2
const COLOURS = {
  line: [60, 60, 60],
  heading: [225, 225, 225],
  cell: [255, 255, 255],
} as const

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * A PNG of an empty table of `rows` body rows under a shaded heading and `columns` columns. The
 * same table gives the same bytes.
 */
export function demoChart(rows: number, columns: number) {
  const width = columns * CELL.width + LINE
  const height = (rows + 1) * CELL.height + LINE
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onLine = x % CELL.width < LINE || y % CELL.height < LINE
      const colour = onLine ? COLOURS.line : y < CELL.height ? COLOURS.heading : COLOURS.cell
      raw.set(colour, y * (width * 3 + 1) + 1 + x * 3)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const bytes = Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return { bytes, width, height }
}
