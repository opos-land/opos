import { BOT_CHECK_STAND_IN } from '@opos/contract'
import { type Env } from '../../config/env'

export const BOT_CHECK = Symbol('BOT_CHECK')

/**
 * The check that an order is placed by a person (docs/specs/0004-checkout-and-orders.md, O4, Q3):
 * the portal hands over a token, and the API verifies it. A real check asks its vendor, so
 * verifying is a call out and never runs inside a transaction.
 */
export interface BotCheck {
  verify(token: string, clientAddress: string): Promise<boolean>
}

/** The token the stand-in passes; any other fails, so that a failed check has a test too. */
export const STAND_IN_TOKEN = BOT_CHECK_STAND_IN

/**
 * The stand-in of local and dev: the portal's own check is not specified yet, and this takes its
 * place where no money moves.
 */
export class StandInBotCheck implements BotCheck {
  verify(token: string): Promise<boolean> {
    return Promise.resolve(token === STAND_IN_TOKEN)
  }
}

/**
 * Production until the portal's check is built: nothing passes, so no order is placed there
 * unchecked. A shop on production sells once a real check takes this one's place.
 */
export class NoBotCheck implements BotCheck {
  verify(): Promise<boolean> {
    return Promise.resolve(false)
  }
}

export const botCheckOf = (env: Pick<Env, 'OPOS_ENV'>): BotCheck =>
  env.OPOS_ENV === 'production' ? new NoBotCheck() : new StandInBotCheck()
