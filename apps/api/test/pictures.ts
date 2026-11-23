import { crc32, deflateSync } from 'node:zlib'

// Pictures made by code for the tests of file storage and image variants: no image file enters
// the repository (docs/PRODUCT.md, 8. Design and public image).

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A PNG chunk: its length, type, data and CRC. */
export function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** The scanlines of a picture: a gradient, its left half transparent where it has alpha. */
function scanlines(width: number, height: number, alpha: boolean, shade = 128) {
  const channels = alpha ? 4 : 3
  const raw = Buffer.alloc((width * channels + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * channels + 1) + 1 + x * channels
      raw[at] = x % 256
      raw[at + 1] = y % 256
      raw[at + 2] = shade
      if (alpha) raw[at + 3] = x < width / 2 ? 0 : 255
    }
  }
  return deflateSync(raw)
}

const ihdr = (width: number, height: number, alpha: boolean) => {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  data[8] = 8
  data[9] = alpha ? 6 : 2
  return pngChunk('IHDR', data)
}

/** A PNG of `width` × `height`, with alpha or without, and any chunks before its pixels. */
export function png(
  width: number,
  height: number,
  { alpha = true, chunks = [] as Buffer[] }: { alpha?: boolean; chunks?: Buffer[] } = {},
) {
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, height, alpha),
    ...chunks,
    pngChunk('IDAT', scanlines(width, height, alpha)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** An animated PNG of two frames of different shades. */
export function animatedPng(width: number, height: number) {
  const actl = Buffer.alloc(8)
  actl.writeUInt32BE(2, 0)
  const fctl = (sequence: number) => {
    const data = Buffer.alloc(26)
    data.writeUInt32BE(sequence, 0)
    data.writeUInt32BE(width, 4)
    data.writeUInt32BE(height, 8)
    data.writeUInt16BE(1, 20)
    data.writeUInt16BE(10, 22)
    return pngChunk('fcTL', data)
  }
  const sequence = Buffer.alloc(4)
  sequence.writeUInt32BE(2)
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, height, false),
    pngChunk('acTL', actl),
    fctl(0),
    pngChunk('IDAT', scanlines(width, height, false, 0)),
    fctl(1),
    pngChunk('fdAT', Buffer.concat([sequence, scanlines(width, height, false, 255)])),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** The names of the chunks of a PNG, in order. */
export function pngChunks(bytes: Buffer) {
  const names: string[] = []
  for (let at = 8; at + 8 <= bytes.length; at += 12 + bytes.readUInt32BE(at)) {
    names.push(bytes.subarray(at + 4, at + 8).toString('latin1'))
  }
  return names
}

/** The header of a JPEG of `width` × `height`: enough to read its size, nothing to decode. */
export function jpegHeader(width: number, height: number) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  const app0 = Buffer.from([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from('JFIF\0'),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ])
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app0,
    sof,
    Buffer.alloc(9),
    Buffer.from([0xff, 0xd9]),
  ])
}

/** The header of a lossless WebP of `width` × `height`. */
export function webpHeader(width: number, height: number) {
  const vp8l = Buffer.alloc(5)
  vp8l[0] = 0x2f
  vp8l.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1)
  const chunk = Buffer.concat([
    Buffer.from('VP8L'),
    Buffer.from([5, 0, 0, 0]),
    vp8l,
    Buffer.alloc(1),
  ])
  const size = Buffer.alloc(4)
  size.writeUInt32LE(4 + chunk.length)
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), chunk])
}

/** A PDF of one empty page. */
export function pdf() {
  return Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
      '',
    ].join('\n'),
  )
}

/**
 * An EXIF segment in the TIFF layout, big-endian: the orientation, a copyright and an artist, a
 * time, a device and a GPS position, as a camera writes them.
 */
export function cameraExif(orientation: number) {
  const entries: [tag: number, type: number, count: number, value: Buffer][] = []
  const ascii = (text: string) => Buffer.from(`${text}\0`, 'latin1')
  const short = (value: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt16BE(value)
    return b
  }
  entries.push([0x010f, 2, 0, ascii('CameraMaker')])
  entries.push([0x0110, 2, 0, ascii('CameraModel')])
  entries.push([0x0112, 3, 1, short(orientation)])
  entries.push([0x0132, 2, 0, ascii('2026:06:01 10:00:00')])
  entries.push([0x013b, 2, 0, ascii('Somebody')])
  entries.push([0x8298, 2, 0, ascii('Copyright Somebody 2026')])
  entries.push([0x8825, 4, 1, Buffer.alloc(4)])
  // The IFD, then its out-of-line values, then the GPS IFD with a latitude reference
  const ifdSize = 2 + entries.length * 12 + 4
  let offset = 8 + ifdSize
  const values: Buffer[] = []
  const ifd = Buffer.alloc(ifdSize)
  ifd.writeUInt16BE(entries.length, 0)
  const gpsAt = (() => {
    let size = 0
    for (const [, type, , value] of entries)
      if (type === 2 && value.length > 4) size += value.length
    return 8 + ifdSize + size
  })()
  entries.forEach(([tag, type, count, value], index) => {
    const at = 2 + index * 12
    ifd.writeUInt16BE(tag, at)
    ifd.writeUInt16BE(type, at + 2)
    ifd.writeUInt32BE(type === 2 ? value.length : count, at + 4)
    if (tag === 0x8825) ifd.writeUInt32BE(gpsAt, at + 8)
    else if (value.length <= 4) value.copy(ifd, at + 8)
    else {
      ifd.writeUInt32BE(offset, at + 8)
      values.push(value)
      offset += value.length
    }
  })
  const gps = Buffer.alloc(2 + 12 + 4)
  gps.writeUInt16BE(1, 0)
  gps.writeUInt16BE(0x0001, 2)
  gps.writeUInt16BE(2, 4)
  gps.writeUInt32BE(2, 6)
  Buffer.from('N\0').copy(gps, 10)
  return Buffer.concat([Buffer.from('MM\0\x2a\0\0\0\x08', 'latin1'), ifd, ...values, gps])
}

/** A JPEG with `exif` put in an APP1 segment right after its start. */
export function withExif(jpeg: Buffer, exif: Buffer) {
  const app1 = Buffer.alloc(4)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(2 + 6 + exif.length, 2)
  return Buffer.concat([
    jpeg.subarray(0, 2),
    app1,
    Buffer.from('Exif\0\0', 'latin1'),
    exif,
    jpeg.subarray(2),
  ])
}

/** The tags of every IFD of the EXIF segments of a JPEG or the eXIf chunk of a PNG. */
export function exifTags(bytes: Buffer): number[] {
  const segments: Buffer[] = []
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 4 <= bytes.length && bytes[at] === 0xff;) {
      const marker = bytes[at + 1]!
      if (marker === 0xda) break
      const length = bytes.readUInt16BE(at + 2)
      const data = bytes.subarray(at + 4, at + 2 + length)
      if (marker === 0xe1 && data.subarray(0, 6).toString('latin1') === 'Exif\0\0') {
        segments.push(data.subarray(6))
      }
      at += 2 + length
    }
  } else {
    for (let at = 8; at + 8 <= bytes.length; at += 12 + bytes.readUInt32BE(at)) {
      if (bytes.subarray(at + 4, at + 8).toString('latin1') === 'eXIf') {
        segments.push(bytes.subarray(at + 8, at + 8 + bytes.readUInt32BE(at)))
      }
    }
  }
  const tags: number[] = []
  for (const tiff of segments) {
    const le = tiff.subarray(0, 2).toString('latin1') === 'II'
    const u16 = (at: number) => (le ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at))
    const u32 = (at: number) => (le ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at))
    const seen = new Set<number>()
    const walk = (offset: number) => {
      if (offset === 0 || seen.has(offset) || offset + 2 > tiff.length) return
      seen.add(offset)
      const count = u16(offset)
      for (let i = 0; i < count; i++) {
        const at = offset + 2 + i * 12
        const tag = u16(at)
        tags.push(tag)
        if (tag === 0x8769 || tag === 0x8825) walk(u32(at + 8))
      }
      // IFD1, where a thumbnail lives
      const next = offset + 2 + count * 12
      if (next + 4 <= tiff.length && u32(next) !== 0) tags.push(-1)
    }
    walk(u32(4))
  }
  return tags
}
