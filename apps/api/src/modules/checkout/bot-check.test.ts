import { describe, expect, it } from 'vitest'
import { botCheckOf, NoBotCheck, STAND_IN_TOKEN, StandInBotCheck } from './bot-check'

describe('the bot check', () => {
  it('is a stand-in on local and dev, which passes its own token and no other', async () => {
    for (const OPOS_ENV of ['local', 'dev'] as const) {
      const check = botCheckOf({ OPOS_ENV })

      expect(check).toBeInstanceOf(StandInBotCheck)
      expect(await check.verify(STAND_IN_TOKEN, '127.0.0.1')).toBe(true)
      expect(await check.verify(`${STAND_IN_TOKEN} `, '127.0.0.1')).toBe(false)
      expect(await check.verify('', '127.0.0.1')).toBe(false)
    }
  })

  // No real check exists yet: on production nothing passes, the stand-in's token included, so no
  // order is placed there unchecked.
  it('passes nothing on production', async () => {
    const check = botCheckOf({ OPOS_ENV: 'production' })

    expect(check).toBeInstanceOf(NoBotCheck)
    expect(await check.verify(STAND_IN_TOKEN, '127.0.0.1')).toBe(false)
  })
})
