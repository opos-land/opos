// @vitest-environment node
import { setupI18n } from '@lingui/core'
import { type Locale } from '@opos/i18n'
import { describe, expect, it, vi } from 'vitest'
import { documentFor, type Site } from './document'
import { type PublicReads } from './reads'

const INDEX = '<!doctype html><html lang="pl"><head><title>OPOS</title></head><body></body></html>'

const translator = (locale: Locale) => {
  const i18n = setupI18n()
  i18n.loadAndActivate({ locale, messages: {} })
  return i18n
}

function site(reads: Partial<PublicReads>, report = vi.fn()): Site {
  return {
    origin: 'https://opos.example',
    report,
    context: {
      apiUrl: 'https://api.opos.example',
      translators: { en: translator('en'), pl: translator('pl') },
      reads: {
        convention: vi.fn().mockResolvedValue(null),
        edition: vi.fn().mockResolvedValue(null),
        programItem: vi.fn().mockResolvedValue(null),
        profile: vi.fn().mockResolvedValue(null),
        ...reads,
      },
    },
  }
}

const convention = {
  name: 'Convention A',
  defaultLocale: 'en',
  timezone: 'Europe/Warsaw',
  logo: null,
}

describe('documentFor', () => {
  it("answers the portal's document with the head of the page asked for", async () => {
    const answer = await documentFor(
      INDEX,
      '/conventions/con-a',
      site({ convention: vi.fn().mockResolvedValue(convention) }),
    )

    expect(answer.status).toBe(200)
    expect(answer.html).toContain('<title>Convention A · OPOS</title>')
    expect(answer.html).toContain('<html lang="en">')
    expect(answer.html).toContain('href="https://opos.example/conventions/con-a"')
  })

  it('answers 404 with the document for a page that is not there, so the portal still says so', async () => {
    const answer = await documentFor(INDEX, '/conventions/nobody', site({}))

    expect(answer.status).toBe(404)
    expect(answer.html).toContain('<title>Page not found · OPOS</title>')
    expect(answer.html).toContain('content="noindex"')
    expect(answer.html).toContain('<body></body>')
  })

  it('answers the plain head when the API is out of reach, and reports why', async () => {
    const report = vi.fn()
    const down = new Error('down')

    const answer = await documentFor(
      INDEX,
      '/conventions/con-a',
      site({ convention: vi.fn().mockRejectedValue(down) }, report),
    )

    expect(answer.status).toBe(200)
    expect(answer.html).toContain('<title>OPOS</title>')
    expect(answer.html).toContain('href="https://opos.example/conventions/con-a"')
    expect(answer.html).not.toContain('noindex')
    expect(report).toHaveBeenCalledWith(down)
  })
})
