import { describe, expect, it } from 'vitest'
import { withinHold } from './hold'

const at = new Date('2027-05-01T10:00:00.000Z')
const later = (ms: number) => new Date(at.getTime() + ms)

describe('an order within its hold', () => {
  it('awaits payment, and its hold has not ended yet', () => {
    expect(withinHold({ status: 'awaiting-payment', holdEndsAt: later(1) }, at)).toBe(true)
    // The hold ends at its last instant: nothing starts in it.
    expect(withinHold({ status: 'awaiting-payment', holdEndsAt: at }, at)).toBe(false)
    expect(withinHold({ status: 'awaiting-payment', holdEndsAt: later(-1) }, at)).toBe(false)
    expect(withinHold({ status: 'awaiting-payment', holdEndsAt: null }, at)).toBe(false)
  })

  it('is no order in another status, whatever its hold says', () => {
    for (const status of ['paid', 'expired', 'needs-review', 'canceled', 'declined'] as const) {
      expect(withinHold({ status, holdEndsAt: later(60_000) }, at)).toBe(false)
    }
  })
})
