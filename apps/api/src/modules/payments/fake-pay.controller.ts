import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common'
import { type PaymentProvider } from '@opos/contract'
import { FakeProvider } from './fake-provider'
import { PROVIDER_MODULES } from './payment-providers'
import { type PaymentProviderModule, type StartRequest } from './provider'

interface Page {
  status(code: number): Page
  type(type: string): Page
  send(body: string): void
  redirect(status: number, url: string): void
}

/** What the buyer can make of a payment at the fake provider, by the button pressed. */
const OUTCOMES = {
  paid: { en: 'Pay', pl: 'Zapłać' },
  'card-declined': { en: 'Have the card declined', pl: 'Odrzuć kartę' },
  'no-funds': { en: 'Have too little money', pl: 'Brak środków' },
  'wrong-code': { en: 'Enter a wrong BLIK code', pl: 'Podaj błędny kod BLIK' },
  canceled: { en: 'Cancel the payment', pl: 'Anuluj płatność' },
} as const

const TEXT = {
  title: { en: 'Fake payment provider', pl: 'Testowy dostawca płatności' },
  note: {
    en: 'This page stands in for a payment provider on test environments. It takes no money.',
    pl: 'Ta strona zastępuje dostawcę płatności w środowiskach testowych. Nie pobiera pieniędzy.',
  },
  back: { en: 'Return to the shop without paying', pl: 'Wróć do sklepu bez płacenia' },
} as const

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)

/**
 * The pay page of the fake provider: where an attempt it started sends the buyer, on local and
 * dev alone. A press of a button is the whole payment: the provider tells the API, as a real one
 * does from its own servers, and sends the buyer back to the shop. The actions are links, since a
 * navigation carries no Origin and no JSON; they change nothing but the fake provider's own word.
 */
@Controller('payments/fake/pay')
export class FakePayController {
  constructor(
    @Inject(PROVIDER_MODULES)
    private readonly modules: ReadonlyMap<PaymentProvider, PaymentProviderModule>,
  ) {}

  /** The attempt the fake provider of this environment started, or `404`. */
  private started(attemptId: string): { fake: FakeProvider; request: StartRequest } {
    const fake = this.modules.get('fake')
    const request = fake instanceof FakeProvider ? fake.started(attemptId) : undefined
    if (!(fake instanceof FakeProvider) || !request) throw new NotFoundException()
    return { fake, request }
  }

  @Get(':attemptId')
  page(@Param('attemptId') attemptId: string, @Res() res: Page) {
    const { request } = this.started(attemptId)
    const locale = request.locale === 'pl' ? 'pl' : 'en'
    const amount = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: request.currency,
    }).format(request.amountMinor / 100)
    const actions = Object.entries(OUTCOMES)
      .map(
        ([outcome, label]) =>
          `<p><a class="action" href="${escape(attemptId)}/${outcome}">${escape(label[locale])}</a></p>`,
      )
      .join('\n')
    res
      .status(200)
      .type('html')
      .send(
        `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(TEXT.title[locale])}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
.action { display: block; padding: 0.75rem 1rem; border: 1px solid; border-radius: 0.5rem; text-align: center; text-decoration: none; color: inherit; }
</style>
</head>
<body>
<main>
<h1>${escape(TEXT.title[locale])}</h1>
<p>${escape(TEXT.note[locale])}</p>
<p><strong>${escape(request.description)}</strong><br>${escape(amount)}</p>
${actions}
<p><a href="${escape(request.returnUrl)}">${escape(TEXT.back[locale])}</a></p>
</main>
</body>
</html>`,
      )
  }

  @Get(':attemptId/:outcome')
  async act(
    @Param('attemptId') attemptId: string,
    @Param('outcome') outcome: string,
    @Res() res: Page,
  ) {
    const { fake, request } = this.started(attemptId)
    if (!(outcome in OUTCOMES)) throw new NotFoundException()
    const paid = outcome === 'paid'
    const body = paid ? fake.pay(attemptId) : fake.fail(attemptId, outcome)
    // The provider tells the API at its public address. A notification that does not arrive is
    // not sent again by this provider: the shop asks for the state of the attempt when it needs.
    await fetch(paid ? request.notificationUrl : request.additionalNotificationUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined)
    res.redirect(303, request.returnUrl)
  }
}
