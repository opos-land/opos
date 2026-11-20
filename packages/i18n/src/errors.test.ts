import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import { errorMessage, unknownError } from './errors'

describe('errorMessage', () => {
  it.each([
    [
      'file.type-refused',
      'Tego pliku nie można tu przyjąć: ten format nie jest dozwolony albo plik jest uszkodzony. Wybierz inny plik.',
    ],
    ['file.too-large', 'Ten plik jest za duży. Wybierz mniejszy.'],
    [
      'file.limit-reached',
      'Nie ma już miejsca na kolejne pliki. Usuń te, których nie potrzebujesz.',
    ],
    ['storage.unavailable', 'Pliki są chwilowo niedostępne. Spróbuj ponownie za chwilę.'],
    ['images.unavailable', 'Obrazy są chwilowo niedostępne. Spróbuj ponownie za chwilę.'],
  ])('says why %s refused a file, in Polish', async (code, rendered) => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage(code)).not.toBe(unknownError)
    expect(i18n._(errorMessage(code))).toBe(rendered)
  })

  it('maps a known code', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(i18n._(errorMessage('tenant.slug-taken'))).toBe(
      'Ten adres jest już zajęty przez inny konwent.',
    )
  })

  // The setup of the shop (docs/specs/0002-shop-setup.md): what an org reads when the shop or its
  // payment provider refuses.
  it.each([
    ['shop.open', 'Sklep jednej z edycji tego konwentu jest otwarty. Najpierw go zamknij.'],
    ['shop.not-ready', 'Sklepu nie można jeszcze otworzyć: brakuje czegoś, czego potrzebuje.'],
    [
      'provider.credentials-refused',
      'Dostawca płatności odrzucił te dane dostępowe. Sprawdź je i spróbuj ponownie.',
    ],
    ['provider.unavailable', 'Dostawca płatności nie odpowiada. Spróbuj ponownie za chwilę.'],
    ['document.in-use', 'Do tego dokumentu odsyła zgoda. Najpierw zmień lub usuń tę zgodę.'],
    ['shop.closed', 'Ten sklep w tej chwili nie prowadzi sprzedaży.'],
    [
      'catalog.in-use',
      'Ta zmiana usunęłaby coś, co jest już w zamówieniu. Zamiast usuwać, ukryj tę pozycję: zniknie z oferty, a w zamówieniach pozostanie.',
    ],
    [
      'consent.in-use',
      'To zostało już zaakceptowane w zamówieniu, więc nie można tego usunąć. Zamiast usuwać, ukryj to: zniknie ze sklepu, a w zamówieniach pozostanie.',
    ],
    [
      'shop.payments-under-way',
      'Zamówienie w tym konwencie oczekuje na płatność. Dane dostępowe zmienisz, gdy zostanie opłacone albo wygaśnie.',
    ],
    ['edition.has-orders', 'Ta edycja ma zamówienia, więc nie można jej usunąć.'],
    [
      'tenant.has-orders',
      'Ten konwent ma zamówienia, które przechowujemy co najmniej pięć lat. Nie można go usunąć.',
    ],
    [
      'order.total-changed',
      'Kwota twojego zamówienia się zmieniła. Sprawdź nową kwotę i ją potwierdź.',
    ],
    ['order.consent-missing', 'Zaakceptuj każdą wymaganą zgodę, żeby złożyć zamówienie.'],
    [
      'order.email-refused',
      'Dostawca płatności nie przyjmuje tego adresu e-mail. Użyj krótszego adresu.',
    ],
    [
      'order.too-many-unpaid',
      'Ten adres e-mail ma już zamówienia oczekujące na płatność. Opłać jedno z nich albo poczekaj, aż wygaśnie.',
    ],
    ['bot-check.failed', 'Nie udało się potwierdzić, że nie jesteś robotem. Spróbuj ponownie.'],
    ['order.hold-ended', 'Czas na opłacenie tego zamówienia minął. Złóż nowe zamówienie.'],
    ['order.already-paid', 'To zamówienie nie czeka już na płatność. Sprawdź jego status.'],
    ['order.not-cancelable', 'Anulować można tylko opłacone zamówienie.'],
    ['order.not-in-review', 'To zamówienie nie jest już do wyjaśnienia. Sprawdź jego status.'],
    [
      'order.not-correctable',
      'Tego zamówienia nie można tak poprawić: poprawia się tylko opłacone zamówienie, a zamówienie ręczne nie ma adresu e-mail.',
    ],
    [
      'order.unavailable',
      'Coś z twojego zamówienia nie jest już dostępne. Sprawdź zamówienie i spróbuj ponownie.',
    ],
    [
      'ticket-type.tiers-overlap',
      'Dwa progi cenowe obejmują ten sam czas. Rodzaj akredytacji ma w danej chwili jedną cenę: zmień daty tak, aby progi się nie nakładały.',
    ],
  ] as const)('says %s in Polish', async (code, text) => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage(code)).not.toBe(unknownError)
    expect(i18n._(errorMessage(code))).toBe(text)
  })

  it.each([
    ['document.too-many', 'Ta edycja osiągnęła limit dokumentów: 30.'],
    ['document.too-many-versions', 'Ten dokument osiągnął limit wersji: 30.'],
    ['consent.too-many', 'Ta edycja osiągnęła limit zgód: 30.'],
    ['catalog.limit-reached', 'Ta lista osiągnęła limit pozycji: 30.'],
  ] as const)('says %s in Polish, with the limit', async (code, text) => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage(code)).not.toBe(unknownError)
    expect(i18n._({ ...errorMessage(code), values: { limit: 30 } })).toBe(text)
  })

  it('says in Polish how much orders hold of a limit set below it', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage('catalog.below-held')).not.toBe(unknownError)
    expect(i18n._({ ...errorMessage('catalog.below-held'), values: { held: 12 } })).toBe(
      'Zamówienia zajmują już więcej, niż wynosi ten limit: 12. Ustaw limit nie niższy od tej liczby.',
    )
  })

  it('says that a convention is suspended, with the glossary rendering', async () => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage('tenant.suspended')).not.toBe(unknownError)
    expect(i18n._(errorMessage('tenant.suspended'))).toBe(
      'Ten konwent jest zawieszony. Skontaktuj się z administratorami OPOS, aby dowiedzieć się więcej.',
    )
  })

  it.each([
    [
      'tenant.slug-retired',
      'Ten adres należał do usuniętego konwentu i nie można go użyć ponownie.',
    ],
    ['tenant.not-suspended', 'Usunąć można tylko zawieszony konwent. Najpierw go zawieś.'],
    [
      'account.is-admin',
      'To konto należy do administratora. Najpierw trzeba mu odebrać rolę administratora.',
    ],
    [
      'admin.mfa-not-enabled',
      'Administrator musi mieć włączone uwierzytelnianie dwuskładnikowe. Włącz je w portalu, a potem poproś o ponowne nadanie roli.',
    ],
    [
      'admin.grant-outdated',
      'Uwierzytelnianie dwuskładnikowe tego konta zmieniło się od nadania roli administratora. Poproś o ponowne nadanie roli.',
    ],
  ])('renders %s of the admin application in Polish', async (code, rendering) => {
    const i18n = setupI18n()
    await activateLocale(i18n, 'pl')

    expect(errorMessage(code)).not.toBe(unknownError)
    expect(i18n._(errorMessage(code))).toBe(rendering)
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
    // auth-js reports a PKCE code without its verifier, as on another device.
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
      'Kod jest nieprawidłowy, wygasł lub został już użyty. Sprawdź go i spróbuj ponownie.',
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

  // A limit can run for an hour, so the message promises no moment.
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
