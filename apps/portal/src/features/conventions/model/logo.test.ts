import { describe, expect, it } from 'vitest'
import { logoBox, logoUrl } from './logo'

const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

describe('logoUrl', () => {
  it("names the convention, the logo's file and the variant under the API's address", () => {
    expect(logoUrl('http://api.opos.localhost:3001', 'convention-a', logo, 'small')).toBe(
      'http://api.opos.localhost:3001/public/tenants/convention-a/logo-files/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60/small',
    )
  })

  it('joins an address that ends with a slash without doubling it', () => {
    expect(logoUrl('https://api.opos.land/', 'convention-a', logo, 'large')).toBe(
      'https://api.opos.land/public/tenants/convention-a/logo-files/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60/large',
    )
  })
})

describe('logoBox', () => {
  it('fits a wide picture to the width of the box, keeping its proportions', () => {
    expect(logoBox(logo, 48)).toEqual({ width: 48, height: 24 })
  })

  it('fits a tall picture to the height of the box', () => {
    expect(logoBox({ ...logo, width: 100, height: 400 }, 48)).toEqual({ width: 12, height: 48 })
  })

  it('never enlarges a picture smaller than the box', () => {
    expect(logoBox({ ...logo, width: 30, height: 10 }, 48)).toEqual({ width: 30, height: 10 })
  })

  it('keeps at least a pixel of a very thin picture', () => {
    expect(logoBox({ ...logo, width: 4000, height: 10 }, 48)).toEqual({ width: 48, height: 1 })
  })
})
