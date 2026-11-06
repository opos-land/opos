import { type Edition } from '@opos/contract'
import { describe, expect, it } from 'vitest'
import { defaultEdition } from './default-edition'

const edition = (slug: string, isActive = false): Edition => ({
  id: `edition-${slug}`,
  slug,
  name: `Edition ${slug}`,
  startsAt: '2026-06-05T08:00:00.000Z',
  endsAt: '2026-06-07T16:00:00.000Z',
  isActive,
  isPublished: false,
})

describe('defaultEdition', () => {
  it('opens the active edition when the member sees it', () => {
    expect(defaultEdition([edition('2027'), edition('2026', true)])?.slug).toBe('2026')
  })

  it('opens the newest edition the member sees when the active one is not among them', () => {
    expect(defaultEdition([edition('2027'), edition('2025')])?.slug).toBe('2027')
  })

  it('has nothing to open when the member sees no edition', () => {
    expect(defaultEdition([])).toBeUndefined()
  })
})
