import { describe, expect, it } from 'vitest'
import { type DiscountsRepository, type StoredDiscount } from './discounts.repository'
import { Discounts } from './discounts.service'

// docs/specs/0008-discount-codes.md, K6 and K7: an order takes a code under the lock of the
// code's row, and by the terms the code has once that lock is held.

const code = (changes: Partial<StoredDiscount> = {}): StoredDiscount => ({
  id: 'code-1',
  code: 'early10',
  kind: 'percent',
  percent: 10,
  amountMinor: null,
  usageLimit: 2,
  validFrom: new Date('2027-01-01T00:00:00Z'),
  validUntil: new Date('2027-12-31T00:00:00Z'),
  endedAt: null,
  ticketTypeIds: ['standard'],
  addOnIds: [],
  itemIds: [],
  ...changes,
})

/**
 * A repository that answers `before` until the row is locked, and `after` from then on: the same
 * code unless told, and `null` for a code deleted meanwhile.
 */
function codes(before: StoredDiscount | undefined, changed?: StoredDiscount | null, uses = 0) {
  const after = changed === null ? undefined : (changed ?? before)
  const calls: string[] = []
  let locked = false
  const repository = {
    find: (_: string, text: string) => {
      calls.push(`find ${text}`)
      return Promise.resolve(locked ? after : before)
    },
    lock: () => {
      calls.push('lock')
      locked = true
      return Promise.resolve(after && { usageLimit: after.usageLimit })
    },
    uses: () => Promise.resolve(uses),
  } as unknown as DiscountsRepository
  return { repository, calls }
}

const at = new Date('2027-06-01T00:00:00Z')

describe('the code an order takes', () => {
  it('is read again once its row is locked: the terms an org changed meanwhile hold', async () => {
    const { repository, calls } = codes(code(), code({ percent: 50 }))

    const taken = await new Discounts(repository).taken('edition-1', ' EARLY10 ', at)

    expect(taken).toMatchObject({ percent: 50 })
    expect(calls).toEqual(['find early10', 'lock', 'find early10'])
  })

  it('is none when the code was ended, or its window closed, while the order waited for the lock', async () => {
    const ended = codes(code(), code({ endedAt: at }))
    const closed = codes(code(), code({ validUntil: at }))
    const deleted = codes(code(), null)

    for (const { repository } of [ended, closed, deleted]) {
      expect(await new Discounts(repository).taken('edition-1', 'early10', at)).toBeUndefined()
    }
  })

  it('is none once its uses are all held, and a code with no limit is always there', async () => {
    expect(
      await new Discounts(codes(code(), code(), 2).repository).taken('edition-1', 'early10', at),
    ).toBeUndefined()
    expect(
      await new Discounts(codes(code(), code(), 1).repository).taken('edition-1', 'early10', at),
    ).toMatchObject({ id: 'code-1' })
    const unlimited = code({ usageLimit: null })
    expect(
      await new Discounts(codes(unlimited, unlimited, 900).repository).taken(
        'edition-1',
        'early10',
        at,
      ),
    ).toMatchObject({ id: 'code-1' })
  })

  it('locks nothing for a text that is no code of the edition', async () => {
    const { repository, calls } = codes(undefined)

    expect(await new Discounts(repository).taken('edition-1', 'nobody', at)).toBeUndefined()
    expect(calls).toEqual(['find nobody'])
  })
})
