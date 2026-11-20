import { describe, expect, it } from 'vitest'
import { addOnFileUrl, merchandiseFileUrl } from './files'

const FILE = '0198c1a0-0000-7000-8000-000000000001'

describe('the address of a file of the shop', () => {
  it('serves the picture of an add-on from an address of its own, without sign-in', () => {
    expect(addOnFileUrl('https://api.opos.test', 'convention-a', FILE, 'small')).toBe(
      `https://api.opos.test/public/tenants/convention-a/add-on-files/${FILE}/small`,
    )
  })

  it('serves a merchandise picture and a size chart from the address of the merchandise', () => {
    expect(merchandiseFileUrl('https://api.opos.test', 'convention-a', FILE, 'large')).toBe(
      `https://api.opos.test/public/tenants/convention-a/merchandise-files/${FILE}/large`,
    )
  })

  it('joins the address of the API whether or not it ends with a slash', () => {
    expect(addOnFileUrl('https://api.opos.test//', 'convention-a', FILE, 'large')).toBe(
      `https://api.opos.test/public/tenants/convention-a/add-on-files/${FILE}/large`,
    )
  })
})
