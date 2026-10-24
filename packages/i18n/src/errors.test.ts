import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { errorMessage, unknownError } from './errors'

describe('errorMessage', () => {
  it('maps a known code', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('tenant.slug-taken'))).toBe(
      'Ten adres jest już zajęty przez inny konwent.',
    )
  })

  it('tells a link opened in another browser apart from a generic failure', async () => {
    // auth-js reports a PKCE code without its verifier, as on another device (PLAN.md 7.7, step 6).
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage('auth.pkce_code_verifier_not_found')).not.toBe(unknownError)
    expect(i18n._(errorMessage('auth.pkce_code_verifier_not_found'))).toBe(
      'Otwórz link w przeglądarce, w której o niego poproszono, albo poproś tam o nowy link.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(errorMessage('no.such-code')).toBe(unknownError)
  })
})
