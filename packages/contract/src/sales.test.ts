import { describe, expect, it } from 'vitest'
import { contract } from './index'
import { salesContract, salesSchema } from './sales'

// docs/specs/0010-sales-reports.md: the dashboard of an edition's sales and its three lists.
describe('the reports of an edition’s sales', () => {
  const id = '0198c1a0-0000-7000-8000-000000000001'
  const sales = {
    currency: 'PLN',
    revenue: { paidMinor: 25000, manualMinor: 7000 },
    orders: { paid: 2, manual: 1, awaitingPayment: 1, needsReview: 0 },
    ticketTypes: [{ id, name: 'Standard', sold: 3, pending: 1 }],
    addOns: [{ id, name: 'Room', kind: 'headcount', sold: 2, pending: 0 }],
    items: [{ id, name: 'Pin', variants: [{ id, labels: [], sold: 2, pending: 3 }] }],
    ageBands: { child: 0, teen: 1, adult: 2 },
    customFields: [{ id, label: 'City', answers: [{ answer: 'Poznań', orders: 2 }] }],
  }

  it('count what is sold apart from what is pending, and never below zero', () => {
    expect(salesSchema.parse(sales)).toEqual(sales)
    const negative = { ...sales, ticketTypes: [{ id, name: 'Standard', sold: -1, pending: 0 }] }
    expect(salesSchema.safeParse(negative).success).toBe(false)
  })

  it('are a dashboard and three files of the edition, each under the tenant', () => {
    expect(contract.sales).toBe(salesContract)
    expect(
      Object.fromEntries(
        Object.entries(salesContract).map(([name, route]) => [name, route['~orpc'].route.path]),
      ),
    ).toEqual({
      get: '/editions/{editionId}/sales',
      ticketHolders: '/editions/{editionId}/exports/ticket-holders',
      merchandisePickList: '/editions/{editionId}/exports/merchandise-pick-list',
      payments: '/editions/{editionId}/exports/payments',
    })
    for (const route of Object.values(salesContract)) {
      expect(route['~orpc'].route.method).toBe('GET')
      expect(route['~orpc'].meta).toMatchObject({ tenant: true })
    }
  })
})
