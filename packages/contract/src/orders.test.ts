import { describe, expect, it } from 'vitest'
import {
  cancelOrderSchema,
  changeOrderEmailSchema,
  declineOrderSchema,
  HANDING_OVER_EMAIL_KINDS,
  handOutSchema,
  LEFT_OUT,
  manualOrderSchema,
  MANUAL_REASONS,
  MAX_EMAIL_PAGE,
  MAX_ORDER_PAGE,
  ORDER_EMAIL_KINDS,
  orderDetailSchema,
  orderEmailDetailSchema,
  orderEmailListQuerySchema,
  orderEmailListSchema,
  orderListQuerySchema,
  ORG_EMAIL_KINDS,
  orderSummarySchema,
  productionNumbersSchema,
  QR_CODE_PATTERN,
  REVIEW_CAUSES,
  swapVariantSchema,
  updateOrderHolderSchema,
} from './orders'

// What an org reads of an edition's orders in the panel (docs/specs/0006-order-management.md,
// F1-F3).

describe('the search of an edition’s orders', () => {
  it('takes nothing, and then reads the first page', () => {
    expect(orderListQuerySchema.parse({})).toEqual({ offset: 0, limit: MAX_ORDER_PAGE })
  })

  // By number, name, email or QR code, and by status, product, variant and date.
  it('takes a text to search by, a status, a product, a variant and two dates', () => {
    const query = {
      q: ' ABCD ',
      qrCodeHash: 'a'.repeat(64),
      status: 'needs-review',
      ticketTypeId: '00000000-0000-4000-8000-000000000001',
      addOnId: '00000000-0000-4000-8000-000000000002',
      itemId: '00000000-0000-4000-8000-000000000003',
      variantId: '00000000-0000-4000-8000-000000000004',
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
      offset: '200',
      limit: '50',
    }

    expect(orderListQuerySchema.parse(query)).toEqual({
      ...query,
      q: 'ABCD',
      offset: 200,
      limit: 50,
    })
  })

  it('reads a page of at most a hundred orders', () => {
    expect(MAX_ORDER_PAGE).toBe(100)
    expect(orderListQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(orderListQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(orderListQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })

  it.each([
    ['a status no order has', { status: 'refunded' }],
    ['a product that is no identifier', { ticketTypeId: 'standard' }],
    ['a date that is none', { from: 'yesterday' }],
    ['a text longer than a search needs', { q: 'x'.repeat(201) }],
    // A QR code is searched by its hash, never sent as it is.
    ['a QR code where its hash belongs', { qrCodeHash: 'A'.repeat(32) }],
    ['a field of its own', { sort: 'total' }],
  ])('refuses %s', (_, query) => {
    expect(orderListQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe('a QR code typed into the search', () => {
  it('is told from a name or a number by its shape', () => {
    expect(QR_CODE_PATTERN.test('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')).toBe(true)
    for (const text of ['ABCDEFGHJK', 'abcdefghijklmnopqrstuvwxyz234567', 'A'.repeat(31) + '1']) {
      expect(QR_CODE_PATTERN.test(text)).toBe(false)
    }
  })
})

describe('an order as the list shows it', () => {
  it('holds who it is for and what it stands at, and nothing of its payment', () => {
    expect(Object.keys(orderSummarySchema.shape).sort()).toEqual([
      'email',
      'holderName',
      'id',
      'manualReason',
      'number',
      'placedAt',
      'status',
      'ticketType',
      'totalMinor',
    ])
  })
})

describe('an order as its page shows it', () => {
  // Its lines, the ticket holder's data, the answers, the consents with the versions accepted,
  // the payment attempts with what the provider's module keeps of each, and the emails sent.
  it('holds everything the order keeps', () => {
    // Whether an email address has an account is told to nobody: the page names no account.
    expect(Object.keys(orderDetailSchema.shape).sort()).toEqual([
      'ageBand',
      'answers',
      'attempts',
      'cancelReason',
      'canceledAt',
      'consents',
      'currency',
      'declineReason',
      'declinedAt',
      'discountCode',
      'email',
      'emails',
      'guardianConsentAcknowledgedAt',
      'hasQrCode',
      'holderName',
      'holds',
      'id',
      'lines',
      'manualReason',
      'note',
      'number',
      'paidAt',
      'paidMinor',
      'placedAt',
      'reviewCause',
      'status',
      'totalMinor',
    ])
  })

  it('names the reasons of a manual order and the causes of a review', () => {
    expect(MANUAL_REASONS).toEqual(['desk', 'invoice', 'complimentary'])
    expect(REVIEW_CAUSES).toEqual(['amount', 'unavailable'])
  })
})

// What an org corrects of a paid order (C1-C4).
describe('a correction of an order', () => {
  it('takes a ticket holder’s name as placing an order takes it', () => {
    expect(updateOrderHolderSchema.parse({ holderName: '  Grace Hopper ' })).toEqual({
      holderName: 'Grace Hopper',
    })
    for (const body of [{ holderName: '   ' }, { holderName: 'x'.repeat(201) }, {}]) {
      expect(updateOrderHolderSchema.safeParse(body).success).toBe(false)
    }
    expect(updateOrderHolderSchema.safeParse({ holderName: 'Ada', ageBand: 'teen' }).success).toBe(
      false,
    )
  })

  it('takes an email as orders hold one: trimmed, in lower case', () => {
    expect(changeOrderEmailSchema.parse({ email: ' Moved@Example.TEST ' })).toEqual({
      email: 'moved@example.test',
    })
    for (const body of [{ email: 'nobody' }, { email: '' }, {}]) {
      expect(changeOrderEmailSchema.safeParse(body).success).toBe(false)
    }
  })

  it('swaps a line’s variant for one named by its identifier', () => {
    const variantId = '00000000-0000-4000-8000-000000000001'
    expect(swapVariantSchema.parse({ variantId })).toEqual({ variantId })
    expect(swapVariantSchema.safeParse({ variantId: 'large' }).success).toBe(false)
    expect(swapVariantSchema.safeParse({ variantId, quantity: 2 }).success).toBe(false)
  })
})

// A cancellation and a decline each take a reason (X1, R4).
describe('a cancellation and a decline', () => {
  it.each([
    ['a cancellation', cancelOrderSchema],
    ['a decline', declineOrderSchema],
  ])('%s takes a reason of up to 500 characters', (_, schema) => {
    expect(schema.parse({ reason: '  Asked for it ' })).toEqual({ reason: 'Asked for it' })
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
      expect(schema.safeParse(body).success).toBe(false)
    }
    expect(schema.safeParse({ reason: 'Asked', refund: true }).success).toBe(false)
  })
})

// A sale made outside the shop, recorded by an org (M1-M4).
describe('a manual order', () => {
  const ticketTypeId = '00000000-0000-4000-8000-000000000001'
  const sale = { reason: 'desk', cart: { ticket: { ticketTypeId } }, ageBand: 'adult' }

  it('takes a reason and what was sold, and requires neither a name, a note nor an answer', () => {
    expect(manualOrderSchema.parse(sale)).toEqual({
      reason: 'desk',
      note: null,
      cart: { ticket: { ticketTypeId }, addOnIds: [], items: [] },
      holderName: '',
      ageBand: 'adult',
      customFieldAnswers: [],
    })
    expect(manualOrderSchema.parse({ ...sale, holderName: ' Ada ', note: ' Cash ' })).toMatchObject(
      { holderName: 'Ada', note: 'Cash' },
    )
    // A note of spaces alone is no note.
    expect(manualOrderSchema.parse({ ...sale, note: '  ' }).note).toBeNull()
  })

  it.each([
    ['no reason', { ...sale, reason: undefined }],
    ['a reason of its own', { ...sale, reason: 'gift' }],
    ['a note longer than 500 characters', { ...sale, note: 'n'.repeat(501) }],
    ['a name longer than 200 characters', { ...sale, holderName: 'n'.repeat(201) }],
    // A manual order asks for no email, stores no consent and has no total to agree on.
    ['an email', { ...sale, email: 'buyer@example.test' }],
    ['a consent', { ...sale, consentIds: [] }],
    ['a total', { ...sale, expectedTotalMinor: 0 }],
  ])('refuses %s', (_, body) => {
    expect(manualOrderSchema.safeParse(body).success).toBe(false)
  })
})

// A hand-out marked on an order's page (H1).
describe('a hand-out', () => {
  const [first, second] = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ]

  it('names the lines handed out, each once', () => {
    expect(handOutSchema.parse({ lineIds: [first, second] })).toEqual({ lineIds: [first, second] })
    for (const lineIds of [[], [first, first], ['a line']]) {
      expect(handOutSchema.safeParse({ lineIds }).success).toBe(false)
    }
    expect(handOutSchema.safeParse({}).success).toBe(false)
  })
})

// The production numbers of an edition's merchandise (S2, S3).
describe('the production numbers', () => {
  it('count each variant of each item three ways', () => {
    const numbers = {
      deadline: '2026-05-01T00:00:00.000Z',
      items: [
        {
          itemId: '00000000-0000-4000-8000-000000000001',
          name: 'Shirt',
          variants: [
            {
              variantId: '00000000-0000-4000-8000-000000000002',
              labels: ['L'],
              paid: 3,
              awaitingPayment: 1,
              needsReview: 0,
            },
          ],
        },
      ],
    }

    expect(productionNumbersSchema.parse(numbers)).toEqual(numbers)
    expect(productionNumbersSchema.parse({ deadline: null, items: [] })).toEqual({
      deadline: null,
      items: [],
    })
  })
})

// The emails of an edition's orders, and what each said (F4).
describe('the emails of an edition’s orders', () => {
  const email = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'order-confirmation',
    recipient: 'buyer@example.test',
    queuedAt: '2026-05-01T10:00:00.000Z',
    sentAt: '2026-05-01T10:00:05.000Z',
    withdrawnAt: null,
    failedAttempts: 0,
    order: { id: '00000000-0000-4000-8000-000000000002', number: 'ABCDEFGH23' },
  }

  it('are searched by a text, and read a page of at most a hundred at a time', () => {
    expect(orderEmailListQuerySchema.parse({})).toEqual({ offset: 0, limit: MAX_EMAIL_PAGE })
    expect(orderEmailListQuerySchema.parse({ q: ' ada@ ', offset: '100', limit: '50' })).toEqual({
      q: 'ada@',
      offset: 100,
      limit: 50,
    })
    expect(MAX_EMAIL_PAGE).toBe(100)
    for (const query of [
      { limit: MAX_EMAIL_PAGE + 1 },
      { offset: -1 },
      { q: ' ' },
      { kind: 'x' },
    ]) {
      expect(orderEmailListQuerySchema.safeParse(query).success).toBe(false)
    }
  })

  it('are listed with their orders, and without what they said', () => {
    const list = { emails: [email, { ...email, recipient: null, sentAt: null }], total: 2 }

    expect(orderEmailListSchema.parse(list)).toEqual(list)
    // What an email said is read on its own page.
    expect(
      orderEmailListSchema.parse({
        emails: [{ ...email, subject: 'Paid', body: 'Thank you.' }],
        total: 1,
      }).emails[0],
    ).toEqual(email)
    expect(
      orderEmailListSchema.safeParse({ emails: [{ ...email, order: undefined }], total: 1 })
        .success,
    ).toBe(false)
  })

  it('say what they said once sent, and nothing before', () => {
    const said = { ...email, subject: 'Your order is paid', body: `The QR code: ${LEFT_OUT}` }

    expect(orderEmailDetailSchema.parse(said)).toEqual(said)
    const silent = { ...email, sentAt: null, subject: null, body: null }
    expect(orderEmailDetailSchema.parse(silent)).toEqual(silent)
    expect(orderEmailDetailSchema.safeParse(email).success).toBe(false)
  })

  it('name the emails that hand an order over, none of them an alert to the orgs', () => {
    expect(HANDING_OVER_EMAIL_KINDS).toEqual([
      'order-confirmation',
      'order-email-changed',
      'order-link',
      'pre-edition-reminder',
    ])
    for (const kind of HANDING_OVER_EMAIL_KINDS) {
      expect(ORDER_EMAIL_KINDS).toContain(kind)
      expect(ORG_EMAIL_KINDS).not.toContain(kind)
    }
  })
})
