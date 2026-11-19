import { describe, expect, it } from 'vitest'
import { logoBox, logoProblem, logoUrl } from './logo-file'

const file = (bytes: number, type: string, name = 'logo.png') =>
  new File([new Uint8Array(bytes)], name, { type })

describe('logoProblem', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('takes a %s image', (type) => {
    expect(logoProblem(file(10, type))).toBeNull()
  })

  it.each(['image/svg+xml', 'image/gif', 'application/pdf', ''])(
    'refuses a file of the type %j',
    (type) => {
      expect(logoProblem(file(10, type))).toBe('type')
    },
  )

  it('takes an image of 2 MB and refuses one a byte over', () => {
    expect(logoProblem(file(2 * 1024 * 1024, 'image/png'))).toBeNull()
    expect(logoProblem(file(2 * 1024 * 1024 + 1, 'image/png'))).toBe('size')
  })

  it('names the type first for a file wrong in both', () => {
    expect(logoProblem(file(2 * 1024 * 1024 + 1, 'application/pdf'))).toBe('type')
  })
})

describe('logoUrl', () => {
  const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

  it("names the convention, the logo's file and the variant under the API's address", () => {
    expect(logoUrl('http://api.opos.localhost:3001/', 'convention-a', logo, 'large')).toBe(
      'http://api.opos.localhost:3001/public/tenants/convention-a/logo-files/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60/large',
    )
  })

  it('fits the picture inside its box, with its proportions kept and never enlarged', () => {
    expect(logoBox(logo, 160)).toEqual({ width: 160, height: 80 })
    expect(logoBox({ ...logo, width: 100, height: 400 }, 160)).toEqual({ width: 40, height: 160 })
    expect(logoBox({ ...logo, width: 30, height: 10 }, 160)).toEqual({ width: 30, height: 10 })
  })
})
