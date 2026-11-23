import { describe, expect, it } from 'vitest'
import { answerFile } from './answer'

const opened = (type: 'image/webp' | 'application/pdf', name: string) => ({
  type,
  name,
  size: 3,
  sha256: 'a'.repeat(64),
  bytes: Buffer.from('abc'),
})

describe('answerFile', () => {
  it('shows an image under its type, sandboxed, unsniffed and for the same site alone', async () => {
    const { headers, body } = answerFile(opened('image/webp', 'cat.webp'), { forEveryone: false })

    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe('image/webp')
    expect(Buffer.from(await body.arrayBuffer()).toString()).toBe('abc')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox")
    expect(headers['cross-origin-resource-policy']).toBe('same-site')
    expect(headers['content-disposition']).toMatch(/^inline;/)
  })

  it('downloads a PDF under the name it was uploaded with', () => {
    const { headers } = answerFile(opened('application/pdf', 'Regulamin "2026".pdf'), {
      forEveryone: false,
    })

    expect(headers['content-disposition']).toMatch(
      /^attachment; filename="Regulamin \\"2026\\".pdf"/,
    )
    expect(headers['content-disposition']).toContain(`filename*=utf-8''Regulamin%20%222026%22.pdf`)
  })

  it('names a download in ASCII and in UTF-8, with no line break', () => {
    const { headers } = answerFile(opened('application/pdf', 'Zażółć\r\ngęślą.pdf'), {
      forEveryone: false,
    })

    expect(headers['content-disposition']).not.toMatch(/[\r\n]/)
    expect(headers['content-disposition']).toContain('filename*=utf-8')
  })

  it('lets a file for everyone be cached for good, and any other nowhere', () => {
    expect(
      answerFile(opened('image/webp', 'a'), { forEveryone: true }).headers['cache-control'],
    ).toBe('public, max-age=31536000, immutable')
    expect(
      answerFile(opened('image/webp', 'a'), { forEveryone: false }).headers['cache-control'],
    ).toBe('private, no-store')
  })

  it('gives the checksum as the entity tag', () => {
    expect(answerFile(opened('image/webp', 'a'), { forEveryone: true }).headers.etag).toBe(
      `"${'a'.repeat(64)}"`,
    )
  })
})
