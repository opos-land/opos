import { crc32, deflateSync } from 'node:zlib'

// The pictures of the seed's demo data: the size chart of a demo item, an empty table, and the
// avatar of a demo profile, a disc on a plain ground, both drawn by this code. No image file
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
  return { bytes: png(width, height, raw), width, height }
}

/** The bytes of a PNG of eight bits a channel, RGB, from its rows of pixels. */
function png(width: number, height: number, raw: Buffer) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const AVATAR = { side: 256, radius: 92, ground: [225, 225, 225], disc: [60, 60, 60] } as const

/**
 * A square PNG of a disc in the middle of a plain ground: what stands for a picture of a person
 * in the demo, and shows where a square is cut from. The same bytes every time.
 */
export function demoAvatar() {
  const { side, radius, ground, disc } = AVATAR
  const raw = Buffer.alloc((side * 3 + 1) * side)
  const middle = (side - 1) / 2
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const inside = (x - middle) ** 2 + (y - middle) ** 2 <= radius ** 2
      raw.set(inside ? disc : ground, y * (side * 3 + 1) + 1 + x * 3)
    }
  }
  return { bytes: png(side, side, raw), width: side, height: side }
}
