import {
  type CheckAnswer,
  type Credentials,
  type PaymentProviderModule,
  type ProviderRequirements,
} from './provider'

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

  /**
   * A consent of its own that "Select all required" may not tick, and an email no longer than a
   * real provider takes: what the shop's pages do with either has a test and a demo.
   */
  requirements(): ProviderRequirements {
    return {
      consent: {
        text: {
          en: 'I accept the terms of the fake payment provider, which takes no money.',
          pl: 'Akceptuję regulamin testowego dostawcy płatności, który nie pobiera pieniędzy.',
        },
        links: [
          {
            label: { en: 'Terms of the fake payment provider', pl: 'Regulamin testowego dostawcy' },
            url: 'https://example.com/fake-provider/terms',
          },
        ],
        selectAllAllowed: false,
      },
      maxEmailLength: 50,
    }
  }

  methods(): string[] {
    return ['blik', 'transfer', 'card']
  }
}
