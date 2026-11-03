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

  it('tells an outage of Supabase Auth apart from a generic failure', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage('server.unavailable')).not.toBe(unknownError)
    expect(i18n._(errorMessage('server.unavailable'))).toBe(
      'Usługa jest chwilowo niedostępna. Spróbuj ponownie za chwilę.',
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

  it.each([
    [
      'mfa.code-invalid',
      'Kod jest nieprawidłowy lub wygasł. Sprawdź kod w aplikacji uwierzytelniającej i spróbuj ponownie.',
    ],
    ['mfa.already-enabled', 'Uwierzytelnianie dwuskładnikowe jest już włączone dla tego konta.'],
    ['mfa.not-required', 'To konto nie potrzebuje teraz kodu.'],
    ['mfa.not-enabled', 'Uwierzytelnianie dwuskładnikowe nie jest włączone dla tego konta.'],
  ])('translates %s of the two-factor routes', async (code, expected) => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage(code)).not.toBe(unknownError)
    expect(i18n._(errorMessage(code))).toBe(expected)
  })

  it('names the address of a speaker without an account, from the params of the error', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    const descriptor = errorMessage('speaker.account-not-found')
    expect(i18n._({ ...descriptor, values: { email: 'kasia@example.com' } })).toBe(
      'Żadne potwierdzone konto nie używa adresu e-mail kasia@example.com. Poproś prelegenta o założenie konta, jeśli jeszcze go nie ma, i potwierdzenie tego adresu.',
    )
  })

  it('names the limit of programme items, from the params of the error', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    const descriptor = errorMessage('program.too-many-items')
    expect(i18n._({ ...descriptor, values: { limit: 1000 } })).toBe(
      'Ta edycja osiągnęła limit punktów programu: 1000.',
    )
  })

  it('says why an item of a past edition takes no like', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('like.edition-ended'))).toBe(
      'Ta edycja już się skończyła, więc nie można polubić jej punktów programu.',
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

  it('names the two refusals of the sign-in routes', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('request.origin-denied'))).toBe(
      'Tego żądania nie można wykonać z tego adresu. Odśwież stronę i spróbuj ponownie.',
    )
    expect(i18n._(errorMessage('auth.google-failed'))).toBe(
      'Logowanie przez Google nie powiodło się. Spróbuj ponownie.',
    )
  })

  it('asks for the code of two-factor authentication when a session is below aal2', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage('session.mfa-required')).not.toBe(unknownError)
    expect(i18n._(errorMessage('session.mfa-required'))).toBe(
      'To konto używa uwierzytelniania dwuskładnikowego. Wpisz kod z aplikacji uwierzytelniającej, aby kontynuować.',
    )
  })

  it('falls back to the generic message for an unknown code', () => {
    expect(errorMessage('no.such-code')).toBe(unknownError)
  })
})
