import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import {
  type ConfirmationData,
  type EmailPart,
  needsReviewEmail,
  orderConfirmationEmail,
  type OrderEmailContent,
  orderExpiredEmail,
  paymentNotNeededEmail,
  paymentNotNeededOrgsEmail,
  paymentUnderReviewEmail,
} from './order-emails'

const order = { conventionName: 'Pyrkon', number: 'ABCDEFGHJK' }

/** Every sentence of an email in `locale`, in the order it is read. */
async function read(content: OrderEmailContent, locale: 'en' | 'pl') {
  const i18n = setupI18n()
  await activateLocale(i18n, locale)
  const said = (
    text: EmailPart extends infer P ? (P extends { text: infer T } ? T : never) : never,
  ) => i18n._(text)
  const parts = content.parts.flatMap((part): string[] => {
    switch (part.kind) {
      case 'paragraph':
      case 'heading':
        return [said(part.text)]
      case 'rows':
        return part.rows.map(
          (row) => `${typeof row.label === 'string' ? row.label : i18n._(row.label)}: ${row.value}`,
        )
      case 'link':
        return [`${typeof part.label === 'string' ? part.label : i18n._(part.label)} <${part.url}>`]
      case 'image':
        return [`${i18n._(part.alt)} [${part.caption}]`]
      case 'quote':
        return [...part.lines]
    }
  })
  return { subject: i18n._(content.subject), parts }
}

const confirmation: ConfirmationData = {
  ...order,
  locale: 'pl',
  currency: 'PLN',
  totalMinor: 37500,
  lines: [
    { name: 'Standard', quantity: 1, amountMinor: 25000 },
    { name: 'Pin', quantity: 2, amountMinor: 10000 },
    { name: 'Room', quantity: 1, amountMinor: 2500 },
  ],
  picksUp: true,
  qrCode: 'QRCODEQRCODE',
  qrCodeCid: 'qr@opos',
  orderLink: 'https://portal.test/orders/token',
  signInLink: null,
  seller: {
    name: 'Seller Ltd',
    address: '1 Main St',
    registrationNumber: '0000000000',
    contactEmail: 'shop@seller.test',
  },
  documents: [{ title: 'Shop terms', url: 'https://api.test/terms' }],
  guardianConsent: null,
}

describe('the confirmation of a paid order', () => {
  it('holds the lines, the total, the QR code, the order link and the seller', async () => {
    const email = await read(orderConfirmationEmail(confirmation), 'en')

    expect(email.subject).toBe('Your order ABCDEFGHJK for Pyrkon is paid')
    expect(email.parts).toEqual(
      expect.arrayContaining([
        'Standard: 250,00\u00a0zł',
        '2 × Pin: 100,00\u00a0zł',
        'Room: 25,00\u00a0zł',
        'Total: 375,00\u00a0zł',
        'The QR code of the order ABCDEFGHJK [QRCODEQRCODE]',
        'See your order <https://portal.test/orders/token>',
        'Shop terms <https://api.test/terms>',
        'Seller Ltd',
        '1 Main St',
        '0000000000',
        'shop@seller.test',
      ]),
    )
    // The amounts are written as its reader writes them: here in Polish, as the order's locale.
    expect(email.parts.join(' ')).toContain('picked up at the convention')
    expect(email.parts.join(' ')).not.toMatch(/sign in|guardian/i)
  })

  it('is said in Polish with the glossary renderings', async () => {
    const email = await read(orderConfirmationEmail(confirmation), 'pl')

    expect(email.subject).toBe(
      'Twoje zamówienie ABCDEFGHJK w sklepie konwentu Pyrkon jest opłacone',
    )
    expect(email.parts).toEqual(
      expect.arrayContaining([
        'Razem: 375,00\u00a0zł',
        'Kod QR zamówienia ABCDEFGHJK [QRCODEQRCODE]',
        'Zobacz zamówienie <https://portal.test/orders/token>',
      ]),
    )
  })

  it('offers a sign-in to an email with an account, and tells a teen of the guardian consent', async () => {
    const email = await read(
      orderConfirmationEmail({
        ...confirmation,
        signInLink: 'https://portal.test/login',
        guardianConsent: { formUrl: 'https://convention.test/form.pdf' },
      }),
      'en',
    )

    expect(email.parts).toEqual(
      expect.arrayContaining([
        'Sign in <https://portal.test/login>',
        'Download the guardian consent form <https://convention.test/form.pdf>',
      ]),
    )
    expect(email.parts.join(' ')).toContain('The ticket holder is a teen')
    expect(email.parts.join(' ')).not.toMatch(/\b18\b/)

    const noForm = await read(
      orderConfirmationEmail({ ...confirmation, guardianConsent: { formUrl: null } }),
      'en',
    )
    expect(noForm.parts.join(' ')).toContain('consent has to be brought on paper')
    expect(noForm.parts.join(' ')).not.toContain('form')
  })

  it('says nothing of a pick-up for an order with no merchandise, and lists no documents when none was accepted', async () => {
    const email = await read(
      orderConfirmationEmail({ ...confirmation, picksUp: false, documents: [] }),
      'en',
    )

    expect(email.parts.join(' ')).not.toMatch(/picked up|Documents/)
  })
})

describe('the other emails of an order', () => {
  it('tell a buyer the order expired, with the way to a new one', async () => {
    const content = orderExpiredEmail({ ...order, shopLink: 'https://portal.test/shop' })

    expect(await read(content, 'en')).toEqual({
      subject: 'Your order ABCDEFGHJK for Pyrkon has expired',
      parts: [
        'Your order ABCDEFGHJK for Pyrkon was not paid in time and has expired. Nothing was charged.',
        'Start a new order <https://portal.test/shop>',
      ],
    })
    expect((await read(content, 'pl')).subject).toBe(
      'Twoje zamówienie ABCDEFGHJK w sklepie konwentu Pyrkon wygasło',
    )
  })

  it('tell a buyer the payment is under review, and where the money is', async () => {
    const content = paymentUnderReviewEmail({
      ...order,
      moneyWith: 'The money is with the convention.',
      contactEmail: 'shop@seller.test',
    })

    const email = await read(content, 'en')
    expect(email.subject).toBe('Your payment for the order ABCDEFGHJK is under review')
    expect(email.parts).toContain('The money is with the convention.')
    expect(email.parts.join(' ')).toContain('will get in touch')
    expect(email.parts.join(' ')).toContain('shop@seller.test')
    expect((await read(content, 'pl')).subject).toBe(
      'Twoja płatność za zamówienie ABCDEFGHJK jest wyjaśniana',
    )
  })

  it('tell the orgs what did not match of an order that needs review', async () => {
    const amount = needsReviewEmail({
      ...order,
      locale: 'pl',
      currency: 'PLN',
      cause: 'amount',
      paidMinor: 9000,
      totalMinor: 10000,
    })
    const gone = needsReviewEmail({
      ...order,
      locale: 'pl',
      currency: 'PLN',
      cause: 'gone',
      paidMinor: 10000,
      totalMinor: 10000,
    })

    expect((await read(amount, 'en')).subject).toBe('The order ABCDEFGHJK of Pyrkon needs review')
    expect((await read(amount, 'en')).parts.join(' ')).toContain(
      'The amount paid, 90,00\u00a0zł, differs from the total of the order, 100,00\u00a0zł.',
    )
    expect((await read(gone, 'en')).parts.join(' ')).toContain('no longer available')
    expect((await read(gone, 'pl')).subject).toBe(
      'Zamówienie ABCDEFGHJK konwentu Pyrkon jest do wyjaśnienia',
    )
  })

  // A convention whose seller's details hold no address leaves no hole in a sentence.
  it('leave out the address to write to when the convention gave none', async () => {
    const review = await read(
      paymentUnderReviewEmail({ ...order, moneyWith: null, contactEmail: null }),
      'en',
    )
    const notNeeded = await read(
      paymentNotNeededEmail({ ...order, moneyWith: null, contactEmail: null }),
      'en',
    )
    const confirmed = await read(orderConfirmationEmail({ ...confirmation, seller: null }), 'en')

    expect(review.parts.join(' ')).not.toMatch(/write to/)
    expect(review.parts.join(' ')).toContain('will get in touch')
    expect(notNeeded.parts.join(' ')).not.toMatch(/write to/)
    expect(confirmed.parts).not.toContain('Seller')
  })

  it('tell a buyer and the orgs of a payment the order did not need', async () => {
    const buyer = paymentNotNeededEmail({
      ...order,
      moneyWith: 'The money stays with you.',
      contactEmail: 'shop@seller.test',
    })
    const orgs = paymentNotNeededOrgsEmail({
      ...order,
      locale: 'pl',
      currency: 'PLN',
      paidMinor: 10000,
      providerReference: 'TX-1',
    })

    expect((await read(buyer, 'en')).parts).toContain('The money stays with you.')
    expect((await read(buyer, 'en')).subject).toBe(
      'A payment arrived that your order ABCDEFGHJK does not need',
    )
    const told = await read(orgs, 'en')
    expect(told.subject).toBe('The order ABCDEFGHJK of Pyrkon got a payment it does not need')
    expect(told.parts.join(' ')).toContain('100,00\u00a0zł')
    expect(told.parts.join(' ')).toContain('TX-1')
    expect(
      (
        await read(
          paymentNotNeededOrgsEmail({
            ...order,
            locale: 'pl',
            currency: 'PLN',
            paidMinor: 1,
            providerReference: null,
          }),
          'en',
        )
      ).parts.join(' '),
    ).not.toContain('transaction')
  })
})
