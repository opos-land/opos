import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { demoAvatar, demoChart, demoPicture } from './demo-chart'

/** The chunks of a PNG, by type. */
function chunks(bytes: Buffer) {
  const found: { type: string; data: Buffer }[] = []
  let at = 8
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at)
    found.push({
      type: bytes.subarray(at + 4, at + 8).toString('latin1'),
      data: bytes.subarray(at + 8, at + 8 + length),
    })
    at += 12 + length
  }
  return found
}

describe('a demo size chart', () => {
  const chart = demoChart(4, 3)
  const parts = chunks(chart.bytes)
  const header = parts.find((part) => part.type === 'IHDR')!.data

  it('is a PNG of the size it says, in plain colour without alpha', () => {
    expect(chart.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([chart.width, chart.height])
    // Eight bits a channel, RGB.
    expect([header[8], header[9]]).toEqual([8, 2])
  })

  it('holds a row of pixels for each of its lines, each as wide as it says', () => {
    const pixels = inflateSync(parts.find((part) => part.type === 'IDAT')!.data)

    expect(pixels.length).toBe((chart.width * 3 + 1) * chart.height)
  })

  it('draws a table: a shaded heading, and lines between its rows and its columns', () => {
    const pixels = inflateSync(parts.find((part) => part.type === 'IDAT')!.data)
    const at = (x: number, y: number) => {
      const start = y * (chart.width * 3 + 1) + 1 + x * 3
      return [...pixels.subarray(start, start + 3)]
    }
    const [line, heading, cell] = [at(0, 0), at(10, 10), at(10, chart.height - 10)]

    expect(new Set([String(line), String(heading), String(cell)]).size).toBe(3)
    // The cell of a body row is white, so that the chart reads as an empty form.
    expect(cell).toEqual([255, 255, 255])
  })

  it('gives the same bytes for the same table, and other bytes for another', () => {
    expect(demoChart(4, 3).bytes.equals(chart.bytes)).toBe(true)
    expect(demoChart(5, 3).bytes.equals(chart.bytes)).toBe(false)
  })
})

// The avatar of a demo profile (docs/specs/0016-public-profile.md, Seed).
describe('a demo avatar', () => {
  const avatar = demoAvatar()
  const parts = chunks(avatar.bytes)
  const header = parts.find((part) => part.type === 'IHDR')!.data

  it('is a square PNG of the size it says, in plain colour without alpha', () => {
    expect(avatar.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(avatar.width).toBe(avatar.height)
    expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([avatar.width, avatar.height])
    expect([header[8], header[9]]).toEqual([8, 2])
  })

  it('draws a disc in the middle of its ground: two colours and no more', () => {
    const pixels = inflateSync(parts.find((part) => part.type === 'IDAT')!.data)
    const row = avatar.width * 3 + 1
    const at = (x: number, y: number) => [
      ...pixels.subarray(y * row + 1 + x * 3, y * row + 4 + x * 3),
    ]
    const middle = Math.floor(avatar.width / 2)

    expect(pixels.length).toBe(row * avatar.height)
    expect(at(middle, middle)).not.toEqual(at(0, 0))
    expect(at(avatar.width - 1, avatar.height - 1)).toEqual(at(0, 0))
    const colours = new Set<string>()
    for (let y = 0; y < avatar.height; y += 1) {
      for (let x = 0; x < avatar.width; x += 1) colours.add(at(x, y).join(','))
    }
    expect(colours.size).toBe(2)
  })

  it('gives the same bytes every time, so a second run of the seed draws nothing anew', () => {
    expect(demoAvatar().bytes.equals(avatar.bytes)).toBe(true)
  })
})

/** The colour of each pixel of a demo PNG, as `r,g,b`, by its place. */
function pixelsOf(picture: { bytes: Buffer; width: number; height: number }) {
  const pixels = inflateSync(chunks(picture.bytes).find((part) => part.type === 'IDAT')!.data)
  const row = picture.width * 3 + 1
  return (x: number, y: number) =>
    pixels.subarray(y * row + 1 + x * 3, y * row + 4 + x * 3).join(',')
}

// The pictures of the demo merchandise, add-ons and logos: a figure on a plain ground, both taken
// from the name, in the proportions a picture is given.
describe('a demo picture', () => {
  const picture = demoPicture('T-shirt - front', 900, 600)
  const header = chunks(picture.bytes).find((part) => part.type === 'IHDR')!.data

  it('is a PNG of the size it is asked for, in plain colour without alpha', () => {
    expect([picture.width, picture.height]).toEqual([900, 600])
    expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([900, 600])
    expect([header[8], header[9]]).toEqual([8, 2])
  })

  it('draws a figure in the middle of its ground: two colours and no more', () => {
    const at = pixelsOf(picture)
    const colours = new Set<string>()
    for (let y = 0; y < picture.height; y += 1) {
      for (let x = 0; x < picture.width; x += 1) colours.add(at(x, y))
    }

    expect(colours.size).toBe(2)
    // A point a quarter of the shorter side right of the middle lies on every figure, a ring too.
    expect(at(450 + 135, 300)).not.toBe(at(0, 0))
    expect(at(899, 599)).toBe(at(0, 0))
  })

  it('gives the same bytes for the same name and size, and other bytes for another', () => {
    expect(demoPicture('T-shirt - front', 900, 600).bytes.equals(picture.bytes)).toBe(true)
    expect(demoPicture('T-shirt - back', 900, 600).bytes.equals(picture.bytes)).toBe(false)
    expect(demoPicture('T-shirt - front', 600, 900).bytes.equals(picture.bytes)).toBe(false)
  })
})
