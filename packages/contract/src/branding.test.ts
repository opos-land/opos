import { describe, expect, it } from 'vitest'
import {
  brandingContract,
  LOGO_TYPES,
  LOGO_VARIANTS,
  MAX_LOGO_SIZE,
  putLogoSchema,
} from './branding'
import { FILE_TYPES, MAX_FILE_SIZE } from './files'

const file = { name: 'logo.png', type: 'image/png', data: Buffer.from('png').toString('base64') }

describe("a convention's logo", () => {
  it('is an image of a type the storage keeps, never a PDF', () => {
    expect([...LOGO_TYPES].sort()).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    for (const type of LOGO_TYPES) expect(FILE_TYPES).toContain(type)
  })

  it('is at most 2 MB, below what the storage keeps', () => {
    expect(MAX_LOGO_SIZE).toBe(2 * 1024 * 1024)
    expect(MAX_LOGO_SIZE).toBeLessThan(MAX_FILE_SIZE)
  })

  it('is shown small in a row of the list and large on a page', () => {
    expect([...LOGO_VARIANTS]).toEqual(['small', 'large'])
  })

  it('arrives as a file and nothing beside it', () => {
    expect(putLogoSchema.parse({ file })).toEqual({ file })
    expect(putLogoSchema.safeParse({}).success).toBe(false)
    expect(putLogoSchema.safeParse({ file, name: 'Mine' }).success).toBe(false)
  })

  it('is taken by the one route marked as taking a file', () => {
    const takesFile = Object.entries(brandingContract)
      .filter(([, route]) => route['~orpc'].meta.takesFile)
      .map(([name]) => name)

    expect(takesFile).toEqual(['putLogo'])
  })
})
