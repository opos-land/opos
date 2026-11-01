import { describe, expect, it } from 'vitest'
import { scheduleItemSchema } from './me'

describe('scheduleItemSchema', () => {
  it('drops anything but the item and where it is on the way out', () => {
    const item = scheduleItemSchema.parse({
      id: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60',
      title: 'Panel',
      startsAt: '2027-06-01T09:00:00Z',
      endsAt: '2027-06-01T10:00:00Z',
      edition: { slug: '2027', name: 'Edition 2027', id: 'hidden' },
      tenant: {
        slug: 'convention-a',
        name: 'Convention A',
        timezone: 'Europe/Warsaw',
        id: 'hidden',
      },
      accountId: 'hidden',
    })

    expect(JSON.stringify(item)).not.toContain('hidden')
  })
})
