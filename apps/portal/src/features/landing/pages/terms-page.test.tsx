import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { CONTACT_EMAIL } from '@opos/contract'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TermsPage } from './terms-page'

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

// docs/specs/0016-public-profile.md, M1-M5: what the platform's terms say.
describe('TermsPage', () => {
  const text = () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <TermsPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    return container.textContent ?? ''
  }

  it('names itself the terms of OPOS', () => {
    text()

    expect(screen.getByRole('heading', { level: 1, name: 'Terms' })).toBeTruthy()
  })

  it('says that an account is for a person of 16 or older, and that a younger attendee needs none', () => {
    const page = text()

    expect(page).toContain('An account is for a person who is 16 or older.')
    expect(page).toContain('A younger attendee needs no account')
  })

  it('says what a name and a profile may not hold: the three rules a takedown rests on', () => {
    const page = text()

    expect(page).toContain('A profile and a name are your own.')
    expect(page).toContain('no picture, name or identity of someone else')
    expect(page).toContain('Nothing offensive, hateful or unlawful.')
    expect(page).toContain('No spam and no advertising.')
    expect(page).toContain('a picture you have the right to show')
  })

  it('says that anyone may report a published profile', () => {
    expect(text()).toContain('Anyone may report a published profile, from its page.')
  })

  it('says what an administrator may do about a profile and a name, and nothing else', () => {
    const page = text()

    expect(page).toContain('take a profile down')
    expect(page).toContain('clear the name of an account')
    expect(page).toContain('They change nothing else of what a profile says.')
    expect(page).toContain('which rule of these terms')
  })

  it('says how a decision is contested, and names the address to write to', () => {
    const page = text()

    expect(page).toContain('ask for a review')
    expect(page).toContain(CONTACT_EMAIL)
  })
})
