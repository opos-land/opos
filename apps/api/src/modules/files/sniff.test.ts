import { describe, expect, it } from 'vitest'
import { jpegHeader, pdf, png, webpHeader } from '../../../test/pictures'
import { sniff } from './sniff'

describe('sniff', () => {
  it('reads a PDF by its header and its end', () => {
    expect(sniff(pdf())).toEqual({ type: 'application/pdf', width: null, height: null })
  })

  it('reads the size of a PNG from its header', () => {
    expect(sniff(png(300, 200))).toEqual({ type: 'image/png', width: 300, height: 200 })
  })

  it('reads the size of a JPEG from its frame header', () => {
    expect(sniff(jpegHeader(8000, 7000))).toEqual({ type: 'image/jpeg', width: 8000, height: 7000 })
  })

  it('reads the size of a lossless WebP', () => {
    expect(sniff(webpHeader(640, 480))).toEqual({ type: 'image/webp', width: 640, height: 480 })
  })

  it.each([
    ['an HTML page', Buffer.from('<!doctype html><script>alert(1)</script>')],
    ['an SVG image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a ZIP archive', Buffer.from('PK\u0003\u0004rest')],
    ['a PDF without its end', pdf().subarray(0, 40)],
    ['a PNG cut before its header', png(10, 10).subarray(0, 20)],
    ['a JPEG with no frame header', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['a RIFF that is no WebP', Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt ')],
    ['nothing', Buffer.alloc(0)],
  ])('knows no type of %s', (_, bytes) => {
    expect(sniff(bytes)).toBeNull()
  })
})
