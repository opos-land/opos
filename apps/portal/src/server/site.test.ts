// @vitest-environment node
import { msg } from '@lingui/core/macro'
import { publicName } from '@opos/i18n/names'
import { describe, expect, it, vi } from 'vitest'
import { devDocument } from './dev-site'
import { createSite } from './site'

const nameOrder = 'nickname-middle'
const INDEX = '<!doctype html><html lang="pl"><head><title>OPOS</title></head><body></body></html>'
const options = { origin: 'http://opos.localhost:5174', apiUrl: 'http://api.opos.invalid:1' }

describe('createSite', () => {
  it("loads the portal's messages in every language it has", async () => {
    const site = await createSite({ ...options, internalApiUrl: options.apiUrl, report: vi.fn() })
    const { en, pl } = site.context.translators

    expect(en._(msg`Programme`)).toBe('Programme')
    expect(pl._(msg`Programme`)).not.toBe('Programme')
    // The shared catalog, which the portal's own does not hold: each language quotes a nickname
    // its own way
    const name = { firstName: 'Anna', nickname: 'Lisek', lastName: 'Nowak', nameOrder } as const
    expect(publicName(en, name)).toBe('Anna “Lisek” Nowak')
    expect(publicName(pl, name)).not.toBe(publicName(en, name))
  })

  it("gives the pages' addresses under the origin and the pictures' under the API's", async () => {
    const site = await createSite({
      ...options,
      internalApiUrl: 'http://api:3001',
      report: vi.fn(),
    })

    expect(site.origin).toBe(options.origin)
    expect(site.context.apiUrl).toBe(options.apiUrl)
  })
})

describe('devDocument', () => {
  it("fills the head of the dev server's document for the page asked for, by its path alone", async () => {
    const html = await devDocument(INDEX, '/privacy?from=mail', options)

    expect(html).toContain('<link rel="canonical" href="http://opos.localhost:5174/privacy"')
    expect(html).toMatch(/<title>[^<]+ · OPOS<\/title>/)
  })

  it('opens the portal with the plain head while the API is out of reach', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const html = await devDocument(INDEX, '/conventions/con-a', options)

    expect(html).toContain('<title>OPOS</title>')
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
