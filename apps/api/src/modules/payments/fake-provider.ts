import { type CheckAnswer, type Credentials, type PaymentProviderModule } from './provider'

/**
 * The accounts the fake provider answers in a way of their own, by the `account` of the
 * credentials: one it refuses, one it accepts as not ready, and one it is out of reach for.
 */
export const FAKE_ACCOUNT = {
  refused: 'refused',
  notReady: 'not-ready',
  unavailable: 'unavailable',
} as const

/**
 * The fake payment provider, loaded on local and dev alone (docs/ARCHITECTURE.md, Environments).
 * It accepts any credentials but the accounts above, so that every answer of a real provider has
 * a test and a demo convention can connect an account.
 */
export class FakeProvider implements PaymentProviderModule {
  readonly name = 'fake'

  connect(credentials: Credentials): Promise<CheckAnswer> {
    if (credentials.account === FAKE_ACCOUNT.refused) return Promise.resolve({ outcome: 'refused' })
    if (credentials.account === FAKE_ACCOUNT.unavailable) {
      return Promise.resolve({ outcome: 'unavailable', reason: 'the fake provider is asked to be' })
    }
    return Promise.resolve({ outcome: 'accepted' })
  }

  missing(credentials: Credentials): string[] {
    return credentials.account === FAKE_ACCOUNT.notReady ? ['fake.not-ready'] : []
  }
}
