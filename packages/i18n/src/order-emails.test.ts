import { setupI18n } from '@lingui/core'
import { describe, expect, it } from 'vitest'
import { activateLocale } from './catalog'
import {
  type ConfirmationData,
  type EmailPart,
  needsReviewEmail,
  orderCanceledEmail,
  orderConfirmationEmail,
  orderDeclinedEmail,
  orderEmailChangedEmail,
  type OrderEmailContent,
  orderEmailReplacedEmail,
  orderExpiredEmail,
  orderHolderChangedEmail,
  orderLinkEmail,
  orderVariantChangedEmail,
  paymentNotNeededEmail,
  paymentNotNeededOrgsEmail,
  paymentUnderReviewEmail,
  preEditionReminderEmail,
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
  discountMinor: null,
  picksUp: true,
  pickupInformation: null,
  qrCode: 'QRCODEQRCODE',
  qrCodeCid: 'qr@opos',
  orderLink: 'https://portal.test/order#token',
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
        'See your order <https://portal.test/order#token>',
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
        'Zobacz zamówienie <https://portal.test/order#token>',
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

  it('tells the edition’s pick-up information when it set one, in place of the general sentence', async () => {
    const told = { ...confirmation, pickupInformation: 'At the desk in hall A.\nFrom 10 to 18.' }

    const email = await read(orderConfirmationEmail(told), 'en')
    const polish = await read(orderConfirmationEmail(told), 'pl')

    expect(email.parts).toEqual(
      expect.arrayContaining([
        'Picking up merchandise',
        'At the desk in hall A.',
        'From 10 to 18.',
      ]),
    )
    expect(email.parts.join(' ')).not.toContain('picked up at the convention')
    expect(polish.parts).toContain('Odbiór gadżetów')
    // An order with no merchandise has nothing to pick up, whatever the edition says.
    const none = await read(orderConfirmationEmail({ ...told, picksUp: false }), 'en')
    expect(none.parts.join(' ')).not.toMatch(/hall A|Picking up/)
  })

  it('says nothing of a pick-up for an order with no merchandise, and lists no documents when none was accepted', async () => {
    const email = await read(
      orderConfirmationEmail({ ...confirmation, picksUp: false, documents: [] }),
      'en',
    )

    expect(email.parts.join(' ')).not.toMatch(/picked up|Documents/)
  })
})

// docs/specs/0008-discount-codes.md, K1: what a discount code took off is a line of its own.
describe('the confirmation of an order that used a discount code', () => {
  it('shows what the code took off before the total', async () => {
    const email = orderConfirmationEmail({
      ...confirmation,
      discountMinor: -2500,
      totalMinor: 35000,
    })

    const told = await read(email, 'pl')
    const discount = told.parts.findIndex((part) => part.startsWith('Rabat: '))
    expect(told.parts[discount]).toMatch(/^Rabat: [-−]25,00\u00a0zł$/)
    expect(told.parts[discount + 1]).toBe('Razem: 350,00\u00a0zł')
    expect((await read(email, 'en')).parts[discount]).toMatch(/^Discount: /)
  })

  it('shows no discount for an order that used no code', async () => {
    const told = await read(orderConfirmationEmail(confirmation), 'en')

    expect(told.parts.join(' ')).not.toMatch(/Discount/)
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

// What an org's work on an order tells its buyer (docs/specs/0006-order-management.md, Emails).
describe('the emails of order management', () => {
  const contact = { contactEmail: 'shop@seller.test' }

  it('tell a buyer the ticket holder was changed, and that nothing else was', async () => {
    const email = orderHolderChangedEmail({ ...order, ...contact, holderName: 'Grace Hopper' })

    const told = await read(email, 'en')
    expect(told.subject).toBe('The ticket holder of your order ABCDEFGHJK was changed')
    expect(told.parts).toEqual([
      'An organizer of Pyrkon changed the ticket holder of your order ABCDEFGHJK.',
      'Ticket holder: Grace Hopper',
      'Nothing else of the order changed, and your QR code stays the same.',
      'If you did not ask for this change, write to shop@seller.test.',
    ])
    const polish = await read(email, 'pl')
    expect(polish.subject).toBe('Zmieniono posiadacza akredytacji w zamówieniu ABCDEFGHJK')
    expect(polish.parts[1]).toBe('Posiadacz akredytacji: Grace Hopper')
  })

  it('tell a buyer a variant was swapped, with the merchandise the order holds now', async () => {
    const email = orderVariantChangedEmail({
      ...order,
      ...contact,
      merchandise: [
        { name: 'T-shirt (L)', quantity: 2 },
        { name: 'Pin', quantity: 1 },
      ],
    })

    const told = await read(email, 'en')
    expect(told.subject).toBe('The merchandise of your order ABCDEFGHJK was changed')
    expect(told.parts).toEqual([
      'An organizer of Pyrkon swapped a variant of the merchandise in your order ABCDEFGHJK. This is the merchandise the order holds now:',
      '2 × T-shirt (L)',
      'Pin',
      'Nothing else of the order changed, and your QR code stays the same.',
      'If you did not ask for this change, write to shop@seller.test.',
    ])
    expect((await read(email, 'pl')).subject).toBe('Zmieniono gadżety w zamówieniu ABCDEFGHJK')
  })

  it('tell the new address of an order its new QR code and order link, and the old one that its own stopped working', async () => {
    const moved = orderEmailChangedEmail({
      ...order,
      ...contact,
      qrCode: 'NEWCODE',
      qrCodeCid: 'qr@opos',
      orderLink: 'https://portal.test/order#new-token',
    })
    const left = orderEmailReplacedEmail({ ...order, ...contact })

    const told = await read(moved, 'en')
    expect(told.subject).toBe('Your order ABCDEFGHJK for Pyrkon is now under this email address')
    expect(told.parts).toEqual([
      'An organizer of Pyrkon moved the order ABCDEFGHJK to this email address.',
      'Your QR code',
      'This is the new QR code of the order. The one sent before no longer works.',
      'The QR code of the order ABCDEFGHJK [NEWCODE]',
      'See your order <https://portal.test/order#new-token>',
      'If you did not ask for this change, write to shop@seller.test.',
    ])
    const old = await read(left, 'en')
    expect(old.subject).toBe('Your order ABCDEFGHJK for Pyrkon was moved to another email address')
    expect(old.parts).toEqual([
      'An organizer of Pyrkon moved the order ABCDEFGHJK to another email address. The QR code and the order link sent to this address no longer work.',
      'If you did not ask for this change, write to shop@seller.test.',
    ])
    expect((await read(left, 'pl')).parts[0]).toBe(
      'Organizator konwentu Pyrkon przeniósł zamówienie ABCDEFGHJK na inny adres e-mail. Kod QR i link do zamówienia wysłane na ten adres już nie działają.',
    )
  })

  // docs/specs/0009-buyer-self-service.md, K4: a fresh link for one that expired.
  it('send a buyer a fresh order link, and say what to do when nobody asked for it', async () => {
    const email = orderLinkEmail({
      ...order,
      ...contact,
      orderLink: 'https://portal.test/order#fresh-token',
    })

    const told = await read(email, 'en')
    expect(told.subject).toBe('A new link to your order ABCDEFGHJK for Pyrkon')
    expect(told.parts).toEqual([
      'Someone asked for a new link to the order ABCDEFGHJK for Pyrkon. It opens the order without a sign-in, so keep it to yourself.',
      'See your order <https://portal.test/order#fresh-token>',
      'If you did not ask for it, you can ignore this email: the order is as it was. With questions, write to shop@seller.test.',
    ])
    const polish = await read(email, 'pl')
    expect(polish.subject).toBe('Nowy link do zamówienia ABCDEFGHJK w sklepie konwentu Pyrkon')
    expect(polish.parts[1]).toBe('Zobacz zamówienie <https://portal.test/order#fresh-token>')
    expect(
      (
        await read(
          orderLinkEmail({ ...order, contactEmail: null, orderLink: 'https://p.test/order#t' }),
          'en',
        )
      ).parts[2],
    ).toBe('If you did not ask for it, you can ignore this email: the order is as it was.')
  })

  // docs/specs/0011-pre-edition-reminder.md, R4.
  it('remind a buyer before the edition: the QR code, the opening hours and where to pick up', async () => {
    const reminder = {
      ...order,
      ...contact,
      editionName: 'Pyrkon 2027',
      qrCode: 'QRCODEQRCODE',
      qrCodeCid: 'qr@opos',
      openingHours: 'Daily, 10 to 20.',
      pickupInformation: 'At the desk in hall A.',
      guardian: null,
      guardianFormUrl: null,
    }

    const told = await read(preEditionReminderEmail(reminder), 'en')
    expect(told.subject).toBe('Pyrkon 2027 starts soon: your QR code')
    expect(told.parts).toEqual([
      'Pyrkon 2027 starts soon. Here is what you need at the entrance for the order ABCDEFGHJK.',
      'Your QR code',
      'Show this code at the entrance and when you pick up your merchandise.',
      'The QR code of the order ABCDEFGHJK [QRCODEQRCODE]',
      'Opening hours',
      'Daily, 10 to 20.',
      'Picking up merchandise',
      'At the desk in hall A.',
      'With questions, write to shop@seller.test.',
    ])
    const polish = await read(preEditionReminderEmail(reminder), 'pl')
    expect(polish.subject).toBe('Pyrkon 2027 już wkrótce: twój kod QR')
    expect(polish.parts[0]).toBe(
      'Pyrkon 2027 już wkrótce. Oto wszystko, czego potrzebujesz przy wejściu. Numer zamówienia: ABCDEFGHJK.',
    )
    expect(polish.parts[4]).toBe('Godziny otwarcia')
  })

  it('remind the buyer of a teen’s or a child’s ticket of the guardian, and leave out what the edition did not say', async () => {
    const bare = {
      ...order,
      contactEmail: null,
      editionName: 'Pyrkon 2027',
      qrCode: 'QRCODEQRCODE',
      qrCodeCid: 'qr@opos',
      openingHours: null,
      pickupInformation: null,
    }
    const teen = await read(
      preEditionReminderEmail({
        ...bare,
        guardian: 'teen',
        guardianFormUrl: 'https://convention.test/consent.pdf',
      }),
      'en',
    )
    const child = await read(
      preEditionReminderEmail({ ...bare, guardian: 'child', guardianFormUrl: null }),
      'pl',
    )

    expect(teen.parts.join(' ')).not.toMatch(/Opening hours|Picking up|write to/)
    expect(teen.parts).toContain(
      'The ticket holder is a teen: bring the written consent of a guardian, on paper.',
    )
    expect(teen.parts).toContain(
      'Download the guardian consent form <https://convention.test/consent.pdf>',
    )
    expect(child.parts).toContain(
      'Posiadacz akredytacji jest dzieckiem: wejdzie tylko z opiekunem, który musi być obecny.',
    )
  })

  it('tell a buyer a payment was declined, where the money is and whom to write to', async () => {
    const email = orderDeclinedEmail({
      ...order,
      ...contact,
      moneyWith: 'The money is with the convention.',
    })

    const told = await read(email, 'en')
    expect(told.subject).toBe('The payment for your order ABCDEFGHJK was declined')
    expect(told.parts).toEqual([
      'An organizer of Pyrkon looked at your payment for the order ABCDEFGHJK and declined it. The order is not paid and gets no QR code.',
      'The money is with the convention.',
      'To settle the return of the money, write to shop@seller.test.',
    ])
    expect((await read(email, 'pl')).subject).toBe(
      'Płatność za zamówienie ABCDEFGHJK została odrzucona',
    )
  })

  it('tell a buyer an order was canceled and its QR code is no longer valid', async () => {
    const email = orderCanceledEmail({ ...order, ...contact })

    const told = await read(email, 'en')
    expect(told.subject).toBe('Your order ABCDEFGHJK for Pyrkon was canceled')
    expect(told.parts).toEqual([
      'An organizer of Pyrkon canceled your order ABCDEFGHJK. Its QR code is no longer valid.',
      'If you have questions about the order or its payment, write to shop@seller.test.',
    ])
    expect((await read(email, 'pl')).parts[0]).toBe(
      'Organizator konwentu Pyrkon anulował twoje zamówienie ABCDEFGHJK. Jego kod QR jest już nieważny.',
    )
  })

  it('leave out the address to write to when the convention gave none', async () => {
    const none = { ...order, contactEmail: null }
    for (const email of [
      orderHolderChangedEmail({ ...none, holderName: 'Ada' }),
      orderVariantChangedEmail({ ...none, merchandise: [] }),
      orderEmailReplacedEmail(none),
      orderDeclinedEmail({ ...none, moneyWith: null }),
      orderCanceledEmail(none),
    ]) {
      expect((await read(email, 'en')).parts.join(' ')).not.toMatch(/write to/)
    }
  })
})
