import { describe, expect, it } from 'vitest'
import { FAKE_ACCOUNT, FakeProvider } from './fake-provider'
import { type StartRequest } from './provider'

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

describe('a payment at the fake provider', () => {
  const demo = { account: 'demo' }
  const request = (id = 'a1'): StartRequest => ({
    id,
    amountMinor: 12300,
    currency: 'PLN',
    reference: 'ABCDEFGHJK',
    description: 'Order ABCDEFGHJK',
    email: 'buyer@example.test',
    locale: 'pl',
    returnUrl: 'https://portal.test/result',
    payableUntil: new Date('2026-05-01T10:30:00Z'),
    notificationUrl: `https://api.test/payments/fake/notifications/${id}`,
    additionalNotificationUrl: `https://api.test/payments/fake/notifications/${id}/additional`,
  })
  const started = async (credentials = demo, id = 'a1') => {
    const provider = new FakeProvider('https://api.test')
    const answer = await provider.start(credentials, request(id))
    return { provider, answer }
  }

  it('starts at its own pay page, which knows the attempt and where the buyer returns', async () => {
    const { provider, answer } = await started()

    expect(answer).toEqual({
      outcome: 'started',
      redirectUrl: 'https://api.test/payments/fake/pay/a1',
    })
    expect(provider.started('a1')).toMatchObject({
      amountMinor: 12300,
      reference: 'ABCDEFGHJK',
      returnUrl: 'https://portal.test/result',
      payableUntil: new Date('2026-05-01T10:30:00Z'),
    })
    expect(provider.started('other')).toBeUndefined()
  })

  it('is out of reach for the account that stands for that', async () => {
    const { provider, answer } = await started({ account: FAKE_ACCOUNT.startUnavailable })

    expect(answer).toMatchObject({ outcome: 'unavailable' })
    expect(provider.started('a1')).toBeUndefined()
  })

  it('reports a payment in a notification the module reads back', async () => {
    const { provider } = await started()
    const at = new Date('2026-05-01T10:00:00Z')

    const body = provider.pay('a1', { at })

    expect(provider.read(demo, request(), body, false)).toEqual({
      kind: 'payment',
      payment: {
        paidAmountMinor: 12300,
        paidAt: at,
        providerReference: expect.stringMatching(/^FAKE-/) as string,
      },
    })
    // Through JSON, as it travels.
    expect(provider.read(demo, request(), JSON.parse(JSON.stringify(body)), false)).toMatchObject({
      kind: 'payment',
    })
  })

  it('reports another amount when asked to, as a provider may', async () => {
    const { provider } = await started()

    const body = provider.pay('a1', { amountMinor: 100 })

    expect(provider.read(demo, request(), body, false)).toMatchObject({
      payment: { paidAmountMinor: 100 },
    })
  })

  it('reads nothing from a notification whose signature does not hold', async () => {
    const { provider } = await started()
    const body = provider.pay('a1')

    // Another amount, another attempt, another account, no signature, and no object at all.
    expect(provider.read(demo, request(), { ...body, amountMinor: 1 }, false)).toBeUndefined()
    expect(provider.read(demo, request('a2'), body, false)).toBeUndefined()
    expect(provider.read({ account: 'other' }, request(), body, false)).toBeUndefined()
    expect(provider.read(demo, request(), { ...body, signature: undefined }, false)).toBeUndefined()
    expect(provider.read(demo, request(), { ...body, signature: 'zz' }, false)).toBeUndefined()
    for (const nothing of [null, undefined, 'paid', 12, []]) {
      expect(provider.read(demo, request(), nothing, false)).toBeUndefined()
    }
  })

  it('reports a payment on its own address and a failure on the additional one', async () => {
    const { provider } = await started()

    expect(provider.read(demo, request(), provider.pay('a1'), true)).toBeUndefined()
    expect(
      provider.read(demo, request(), provider.fail('a1', 'card-declined'), false),
    ).toBeUndefined()
  })

  it.each([
    ['card-declined', 'declined'],
    ['no-funds', 'insufficient-funds'],
    ['wrong-code', 'wrong-code'],
    ['timed-out', 'timed-out'],
    ['canceled', 'canceled'],
    // A code the module does not know is the general failure.
    ['E-4012', 'failed'],
  ] as const)('reads its failure %s as %s, and keeps its own code', async (code, reason) => {
    const { provider } = await started()

    expect(provider.read(demo, request(), provider.fail('a1', code), true)).toEqual({
      kind: 'failure',
      reason,
      code,
      message: expect.any(String) as string,
    })
  })

  it('tells the state of an attempt: paid once it was paid, with the amount and the time', async () => {
    const { provider } = await started()
    const at = new Date('2026-05-01T10:00:00Z')

    expect(await provider.state(demo, request())).toEqual({ state: 'not-paid' })
    provider.fail('a1', 'canceled')
    expect(await provider.state(demo, request())).toEqual({ state: 'not-paid' })
    provider.pay('a1', { at })
    expect(await provider.state(demo, request())).toMatchObject({
      state: 'paid',
      payment: { paidAmountMinor: 12300, paidAt: at },
    })
    // An attempt it never started is not paid.
    expect(await provider.state(demo, request('never'))).toEqual({ state: 'not-paid' })
  })

  it('cannot tell the state of an attempt for the account that stands for that', async () => {
    const { provider } = await started()
    provider.pay('a1')

    expect(
      await provider.state({ account: FAKE_ACCOUNT.stateUnavailable }, request()),
    ).toMatchObject({ state: 'unavailable' })
  })

  it('settles a payment, again and again, and is out of reach for the account that stands for that', async () => {
    const { provider } = await started()
    const payment = { paidAmountMinor: 12300, paidAt: new Date(), providerReference: 'FAKE-1' }

    expect(await provider.settle(demo, request(), payment)).toEqual({ outcome: 'settled' })
    expect(await provider.settle(demo, request(), payment)).toEqual({ outcome: 'settled' })
    expect(
      await provider.settle({ account: FAKE_ACCOUNT.settleUnavailable }, request(), payment),
    ).toMatchObject({ outcome: 'unavailable' })
  })

  it('refuses a payment, which is then no longer paid, unless its account cannot refuse', async () => {
    const { provider } = await started()
    provider.pay('a1')
    const payment = { paidAmountMinor: 12300, paidAt: new Date(), providerReference: 'FAKE-1' }

    expect(
      await provider.refuse({ account: FAKE_ACCOUNT.cannotRefuse }, request(), payment),
    ).toEqual({ refused: false })
    expect(await provider.state(demo, request())).toMatchObject({ state: 'paid' })
    expect(await provider.refuse(demo, request(), payment)).toEqual({ refused: true })
    expect(await provider.state(demo, request())).toEqual({ state: 'not-paid' })
  })

  it('says where the money is, in English and in Polish, and keeps the transaction number', async () => {
    const { provider } = await started()
    const payment = { paidAmountMinor: 12300, paidAt: new Date(), providerReference: 'FAKE-1' }

    for (const where of ['convention', 'buyer'] as const) {
      expect(Object.keys(provider.moneyWith(where)).sort()).toEqual(['en', 'pl'])
    }
    expect(provider.moneyWith('convention')).not.toEqual(provider.moneyWith('buyer'))
    expect(await provider.information(demo, request(), payment)).toEqual({ transaction: 'FAKE-1' })
    expect(
      await provider.information(demo, request(), { ...payment, providerReference: null }),
    ).toEqual({})
  })
})
