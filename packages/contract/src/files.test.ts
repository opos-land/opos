import { describe, expect, it } from 'vitest'
import { errorCodes } from './errors'
import {
  FILE_TYPES,
  MAX_FILE_SIZE,
  MAX_UPLOAD_BODY,
  storedFileSchema,
  uploadedFileSchema,
} from './files'

const valid = {
  name: 'terms.pdf',
  type: 'application/pdf',
  data: Buffer.from('%PDF-1.7').toString('base64'),
}

const refused = (result: { success: boolean }) => expect(result.success).toBe(false)

describe('FILE_TYPES', () => {
  it('lists the inert types the storage keeps, and nothing a browser could run', () => {
    expect([...FILE_TYPES].sort()).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
  })
})

describe('uploadedFileSchema', () => {
  it('takes a name, a declared type and the bytes in base64', () => {
    expect(uploadedFileSchema.parse(valid)).toEqual(valid)
  })

  it('takes a file of 15 MB written as base64', () => {
    const data = 'A'.repeat(Math.ceil(MAX_FILE_SIZE / 3) * 4)
    expect(uploadedFileSchema.safeParse({ ...valid, data }).success).toBe(true)
  })

  it.each([
    ['an HTML file', { type: 'text/html' }],
    ['an SVG image', { type: 'image/svg+xml' }],
    ['an archive', { type: 'application/zip' }],
    ['an empty name', { name: ' ' }],
    ['a name above 255 characters', { name: 'n'.repeat(256) }],
    ['bytes that are not base64', { data: 'not base64!' }],
    ['no bytes', { data: '' }],
    ['more than 15 MB', { data: 'A'.repeat(Math.ceil(MAX_FILE_SIZE / 3) * 4 + 4) }],
    ['an unknown field', { path: '/etc' }],
  ])('refuses %s', (_, change) => {
    refused(uploadedFileSchema.safeParse({ ...valid, ...change }))
  })
})

describe('MAX_UPLOAD_BODY', () => {
  // The JSON body of a route that takes a file carries 15 MB as base64, a third more, and the
  // rest of its form.
  it('holds a file of 15 MB written as text, and stays within 21 MB', () => {
    expect(MAX_UPLOAD_BODY).toBeGreaterThan((MAX_FILE_SIZE / 3) * 4)
    expect(MAX_UPLOAD_BODY).toBeLessThanOrEqual(21 * 1024 * 1024)
  })
})

describe('storedFileSchema', () => {
  it('gives what a page needs to show a file: its name, type, size and an image dimensions', () => {
    const file = {
      id: '00000000-0000-4000-8000-000000000000',
      name: 'cat.png',
      type: 'image/png',
      size: 10,
      width: 4,
      height: 3,
    }
    expect(storedFileSchema.parse(file)).toEqual(file)
    expect(
      storedFileSchema.parse({ ...file, type: 'application/pdf', width: null, height: null }),
    ).toBeTruthy()
  })
})

describe('the refusals of a route that takes a file', () => {
  it.each([
    'file.type-refused',
    'file.too-large',
    'file.limit-reached',
    'storage.unavailable',
    'images.unavailable',
  ])('lists %s', (code) => {
    expect(errorCodes).toContain(code)
  })
})
