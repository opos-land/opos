import { describe, expect, it } from 'vitest'
import { FAKE_ACCOUNT, FakeProvider } from './fake-provider'

const fake = new FakeProvider()

describe('the fake provider', () => {
  it('is named fake', () => {
    expect(fake.name).toBe('fake')
  })

  it('accepts any credentials, and finds nothing missing in them', async () => {
    expect(await fake.connect({ account: 'demo' })).toEqual({ outcome: 'accepted' })
    expect(await fake.connect({ anything: 'at all' })).toEqual({ outcome: 'accepted' })
    expect(fake.missing({ account: 'demo' })).toEqual([])
  })

  it('refuses the one account it refuses', async () => {
    expect(await fake.connect({ account: FAKE_ACCOUNT.refused })).toEqual({ outcome: 'refused' })
  })

  it('accepts the one account it reports as not ready, and names what it misses', async () => {
    expect(await fake.connect({ account: FAKE_ACCOUNT.notReady })).toEqual({ outcome: 'accepted' })
    expect(fake.missing({ account: FAKE_ACCOUNT.notReady })).toEqual(['fake.not-ready'])
  })

  it('is out of reach for the one account that stands for that', async () => {
    expect(await fake.connect({ account: FAKE_ACCOUNT.unavailable })).toMatchObject({
      outcome: 'unavailable',
    })
  })
})
