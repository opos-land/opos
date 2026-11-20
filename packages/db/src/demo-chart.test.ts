import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { demoChart } from './demo-chart'

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
