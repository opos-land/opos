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

  it('names the address of a speaker without an account, from the params of the error', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    const descriptor = errorMessage('speaker.account-not-found')
    expect(i18n._({ ...descriptor, values: { email: 'kasia@example.com' } })).toBe(
      'Żadne potwierdzone konto nie używa adresu e-mail kasia@example.com. Poproś prelegenta o założenie konta, jeśli jeszcze go nie ma, i potwierdzenie tego adresu.',
    )
  })

  // A limit can run for an hour (PLAN.md 7.9), so the message promises no moment.
  it('asks to come back later above a rate limit', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('request.rate-limited'))).toBe(
      'Zbyt wiele prób. Spróbuj ponownie później.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(errorMessage('no.such-code')).toBe(unknownError)
  })
})
