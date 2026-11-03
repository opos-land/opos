import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PrivacyPage } from './privacy-page'

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

// The policy states what PRODUCT.md 10 states about two-factor authentication.
describe('PrivacyPage', () => {
  const text = () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      </I18nProvider>,
    )
    return container.textContent ?? ''
  }

  it('says what two-factor authentication stores, and that only hashes of the recovery codes stay', () => {
    const page = text()

    expect(page).toContain('two-factor authentication')
    expect(page).toContain('ten one-time recovery codes')
    expect(page).toContain('only their hashes')
  })

  it('names the email that tells you two-factor authentication was turned off', () => {
    expect(text()).toContain('two-factor authentication is turned off')
  })

  it('says how long unused and used recovery codes stay', () => {
    const page = text()

    expect(page).toContain(
      'Your unused recovery codes: until you turn off two-factor authentication.',
    )
    expect(page).toContain(
      'The hash of a recovery code you have used: as a record, until you delete the account.',
    )
  })

  it('lists two-factor authentication among what goes with a deleted account', () => {
    expect(text()).toContain('two-factor authentication with its recovery codes')
  })
})
