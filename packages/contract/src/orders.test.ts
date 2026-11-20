import { describe, expect, it } from 'vitest'
import {
  cancelOrderSchema,
  changeOrderEmailSchema,
  declineOrderSchema,
  MANUAL_REASONS,
  MAX_ORDER_PAGE,
  orderDetailSchema,
  orderListQuerySchema,
  orderSummarySchema,
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
    expect(Object.keys(orderDetailSchema.shape).sort()).toEqual([
      'account',
      'ageBand',
      'answers',
      'attempts',
      'cancelReason',
      'canceledAt',
      'consents',
      'currency',
      'declineReason',
      'declinedAt',
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
