import { type FileType } from '@opos/contract'

/** What the bytes of a file are, and an image's size as its header states it. */
export interface Sniffed {
  type: FileType
  width: number | null
  height: number | null
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((byte, i) => bytes[at + i] === byte)

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

const PDF_START = ascii('%PDF-')
const PDF_END = ascii('%%EOF')
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = ascii('IHDR')

function pdf(bytes: Uint8Array): Sniffed | null {
  if (!startsWith(bytes, PDF_START)) return null
  // The end marker sits within the last kilobyte, after which only whitespace may follow.
  for (let at = bytes.length - PDF_END.length; at >= Math.max(0, bytes.length - 1024); at--) {
    if (startsWith(bytes, PDF_END, at))
      return { type: 'application/pdf', width: null, height: null }
  }
  return null
}

function png(view: DataView, bytes: Uint8Array): Sniffed | null {
  if (!startsWith(bytes, PNG) || !startsWith(bytes, IHDR, 12) || bytes.length < 24) return null
  return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) }
}

// The start-of-frame markers of a JPEG: C0 to CF but the Huffman, arithmetic and lossless tables.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpeg(view: DataView, bytes: Uint8Array): Sniffed | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null
  let at = 2
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!
    if (marker === 0xd9 || marker === 0xda) return null
    const length = view.getUint16(at + 2)
    if (SOF.has(marker)) {
      if (at + 9 > bytes.length) return null
      return { type: 'image/jpeg', width: view.getUint16(at + 7), height: view.getUint16(at + 5) }
    }
    at += 2 + length
  }
  return null
}

function webp(view: DataView, bytes: Uint8Array): Sniffed | null {
  if (!startsWith(bytes, ascii('RIFF')) || !startsWith(bytes, ascii('WEBP'), 8)) return null
  const size = (width: number, height: number): Sniffed => ({ type: 'image/webp', width, height })
  const u24 = (at: number) =>
    view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16)
  if (startsWith(bytes, ascii('VP8X'), 12) && bytes.length >= 30) {
    return size(u24(24) + 1, u24(27) + 1)
  }
  if (startsWith(bytes, ascii('VP8L'), 12) && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true)
    return size((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
  }
  if (startsWith(bytes, ascii('VP8 '), 12) && bytes.length >= 30) {
    return size(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff)
  }
  return null
}

/**
 * The type the bytes are among those the storage keeps, read from their signature and header
 * alone: nothing is decoded here (docs/specs/0013-image-variants.md). Anything else is null.
 */
export function sniff(bytes: Uint8Array): Sniffed | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return pdf(bytes) ?? png(view, bytes) ?? jpeg(view, bytes) ?? webp(view, bytes)
}
