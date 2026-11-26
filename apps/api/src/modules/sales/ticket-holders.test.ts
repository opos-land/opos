import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ticketHolderDetails } from './ticket-holders'

// docs/specs/0010-sales-reports.md, E2: what a row of the ticket holder list takes from the rows
// read beside its order, the add-ons and the answers to the custom fields.
describe('what a ticket holder’s row lists beside its order', () => {
  const isPaid = (status: string) => status === 'paid' || status === 'paid-manual'
  const fields = [{ id: 'city' }, { id: 'diet' }]

  it('lists the add-ons of the order and of every paid order on its QR code, in the catalog’s order', () => {
    const details = ticketHolderDetails({
      fields,
      // As the catalog orders them: the workshop, the room, the breakfast.
      addOns: [
        { orderId: 'more-paid', name: 'Workshop' },
        { orderId: 'more-unpaid', name: 'Workshop' },
        { orderId: 'ada', name: 'Sleeping room' },
        { orderId: 'more-canceled', name: 'Sleeping room' },
        { orderId: 'grace', name: 'Sleeping room' },
        { orderId: 'more-manual', name: 'Breakfast' },
        { orderId: 'alone', name: 'Breakfast' },
      ],
      answers: [],
      carried: [
        { orderId: 'ada', qrCodeId: 'code-ada', status: 'paid' },
        { orderId: 'more-paid', qrCodeId: 'code-ada', status: 'paid' },
        { orderId: 'more-manual', qrCodeId: 'code-ada', status: 'paid-manual' },
        // An order on the code that nobody paid for, or that was canceled, adds nothing.
        { orderId: 'more-unpaid', qrCodeId: 'code-ada', status: 'awaiting-payment' },
        { orderId: 'more-canceled', qrCodeId: 'code-ada', status: 'canceled' },
        { orderId: 'grace', qrCodeId: 'code-grace', status: 'paid' },
      ],
      isPaid,
    })

    expect(details.addOns('ada')).toEqual(['Workshop', 'Sleeping room', 'Breakfast'])
    // Another ticket keeps its own add-ons alone, and so does an order that carries no code.
    expect(details.addOns('grace')).toEqual(['Sleeping room'])
    expect(details.addOns('alone')).toEqual(['Breakfast'])
    expect(details.addOns('nothing')).toEqual([])
  })

  it('lists the add-ons of a canceled order with a ticket, its own beside the paid ones on its code', () => {
    const details = ticketHolderDetails({
      fields,
      addOns: [
        { orderId: 'more', name: 'Workshop' },
        { orderId: 'gone', name: 'Sleeping room' },
      ],
      answers: [],
      carried: [
        { orderId: 'gone', qrCodeId: 'code', status: 'canceled' },
        { orderId: 'more', qrCodeId: 'code', status: 'paid' },
      ],
      isPaid,
    })

    expect(details.addOns('gone')).toEqual(['Workshop', 'Sleeping room'])
  })

  it('gives the order’s answer to each field in the fields’ order, empty where it gave none', () => {
    const details = ticketHolderDetails({
      fields,
      addOns: [],
      answers: [
        { orderId: 'ada', fieldId: 'diet', answer: 'Vegan' },
        { orderId: 'grace', fieldId: 'city', answer: 'Gdynia' },
        { orderId: 'ada', fieldId: 'city', answer: 'Poznań' },
      ],
      carried: [],
      isPaid,
    })

    expect(details.answers('ada')).toEqual(['Poznań', 'Vegan'])
    expect(details.answers('grace')).toEqual(['Gdynia', ''])
    expect(details.answers('nothing')).toEqual(['', ''])
  })

  // The list is put together inside a request, on the one thread every other request waits for:
  // its work grows with the rows of the edition, never with their square.
  it('puts together the rows of a large edition without holding the process', () => {
    const ids = Array.from({ length: 20_000 }, () => randomUUID())
    const many = Array.from({ length: 5 }, () => ({ id: randomUUID() }))
    // The rows as the database may hand them: in no order of the orders'.
    const backwards = [...ids].reverse()
    const input = {
      fields: many,
      addOns: backwards.flatMap((orderId) => [
        { orderId, name: 'Workshop' },
        { orderId, name: 'Sleeping room' },
      ]),
      answers: backwards.flatMap((orderId) =>
        many.map((field) => ({ orderId, fieldId: field.id, answer: 'Poznań' })),
      ),
      carried: backwards.map((orderId) => ({ orderId, qrCodeId: randomUUID(), status: 'paid' })),
      isPaid,
    }

    const started = performance.now()
    const details = ticketHolderDetails(input)
    const rows = ids.map((id) => [details.addOns(id), details.answers(id)])
    const took = performance.now() - started

    expect(rows).toHaveLength(20_000)
    expect(rows[0]).toEqual([
      ['Workshop', 'Sleeping room'],
      ['Poznań', 'Poznań', 'Poznań', 'Poznań', 'Poznań'],
    ])
    expect(took).toBeLessThan(2000)
  })
})
