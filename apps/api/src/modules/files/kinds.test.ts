import { pgTable, uuid } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { defineKinds, type FileKind, MAX_VARIANTS } from './kinds'

const holders = pgTable('holders', { fileId: uuid() })

const pdfKind: FileKind = {
  name: 'terms',
  owner: 'convention',
  types: ['application/pdf'],
  pointer: holders.fileId,
}

const pictureKind: FileKind = {
  name: 'picture',
  owner: 'edition',
  types: ['image/jpeg', 'image/png', 'image/webp'],
  pointer: holders.fileId,
  variants: {
    thumb: { width: 160, height: 160, fit: 'cover', withUpload: true },
    large: { width: 1600, height: 1600, fit: 'inside' },
  },
}

describe('defineKinds', () => {
  it('holds the kinds by their names', () => {
    const kinds = defineKinds([pdfKind, pictureKind])
    expect(kinds.get('terms')).toBe(pdfKind)
    expect(kinds.get('picture')).toBe(pictureKind)
  })

  it.each<[string, FileKind[]]>([
    ['two kinds of one name', [pdfKind, { ...pdfKind, types: ['image/png'] }]],
    ['a name that is not lowercase words', [{ ...pdfKind, name: 'Terms of sale' }]],
    ['a kind that takes no type', [{ ...pdfKind, types: [] }]],
    ['a type the storage does not keep', [{ ...pdfKind, types: ['image/svg+xml' as 'image/png'] }]],
    ['a limit above 15 MB', [{ ...pdfKind, maxSize: 15 * 1024 * 1024 + 1 }]],
    ['a limit that is not positive', [{ ...pdfKind, maxSize: 0 }]],
    [
      'variants of a kind that takes no image',
      [{ ...pdfKind, variants: { thumb: { width: 10, height: 10, fit: 'inside' } } }],
    ],
    ['a kind of images without variants', [{ ...pictureKind, variants: {} }]],
    [
      'more variants than a kind may have',
      [
        {
          ...pictureKind,
          variants: Object.fromEntries(
            Array.from({ length: MAX_VARIANTS + 1 }, (_, i) => [
              `v${i}`,
              { width: 10 + i, height: 10, fit: 'inside' as const },
            ]),
          ),
        },
      ],
    ],
    [
      'a variant named as the master',
      [{ ...pictureKind, variants: { master: { width: 10, height: 10, fit: 'inside' } } }],
    ],
    [
      'a variant larger than a master',
      [{ ...pictureKind, variants: { huge: { width: 4097, height: 10, fit: 'inside' } } }],
    ],
    [
      'a variant with no size',
      [{ ...pictureKind, variants: { none: { width: 0, height: 10, fit: 'cover' } } }],
    ],
  ])('refuses %s', (_, kinds) => {
    expect(() => defineKinds(kinds)).toThrow()
  })
})
