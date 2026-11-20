import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type PaymentProvider } from '@opos/contract'

/** A field of the credentials a provider's module asks for. */
export interface CredentialField {
  name: string
  label: MessageDescriptor
  hint?: MessageDescriptor
  /**
   * How it is asked: a secret, typed blind, unless it says otherwise; a text shown as it is
   * typed; or a choice, an answer of the org that is a yes once ticked and a no until then.
   */
  kind?: 'secret' | 'text' | 'choice'
}

/**
 * The providers as the panel shows them: a name and the fields of their credentials. Which of
 * them an account may be connected to is the API's to say, by environment.
 */
export const PROVIDERS: Record<
  PaymentProvider,
  {
    name: MessageDescriptor
    fields: CredentialField[]
    /** Whether it answers only to the addresses entered in its panel: the org is shown which. */
    needsAddress?: boolean
  }
> = {
  fake: {
    name: msg`Fake provider (no real payments)`,
    fields: [
      {
        name: 'account',
        label: msg`Account`,
        hint: msg`Any text connects an account that is ready. The fake provider refuses “refused”, reports “not-ready” as not ready, and does not answer for “unavailable”.`,
      },
    ],
  },
  przelewy24: {
    name: msg`Przelewy24`,
    needsAddress: true,
    fields: [
      {
        name: 'merchantId',
        kind: 'text',
        label: msg`Merchant ID`,
        hint: msg`The number of the account, as Przelewy24’s panel shows it.`,
      },
      {
        name: 'posId',
        kind: 'text',
        label: msg`Point of sale ID`,
        hint: msg`The same number as the merchant ID, unless Przelewy24 gave the shop one of its own.`,
      },
      { name: 'crc', label: msg`CRC key` },
      {
        name: 'apiKey',
        label: msg`API key`,
        hint: msg`Przelewy24’s panel calls it the reports key.`,
      },
      {
        name: 'sandbox',
        kind: 'choice',
        label: msg`This is a sandbox account`,
        hint: msg`A sandbox account takes no real money, and connects only where none is taken.`,
      },
      {
        name: 'abandonedPaymentEmailOff',
        kind: 'choice',
        label: msg`Przelewy24’s own email with a link to finish an abandoned payment is off for this account`,
        hint: msg`It is off unless Przelewy24’s account manager turned it on. With it on, a buyer could pay for an order after its time ran out, so the account is ready to sell only once you confirm it is off.`,
      },
    ],
  },
}

export const emptyCredentials = (provider: PaymentProvider): Record<string, string> =>
  Object.fromEntries(
    PROVIDERS[provider].fields.map((field) => [field.name, field.kind === 'choice' ? 'false' : '']),
  )

/** The body that connects an account, or null while a field of the provider is empty. */
export function credentialsBody(provider: PaymentProvider, values: Record<string, string>) {
  const credentials: Record<string, string> = {}
  for (const { name, kind } of PROVIDERS[provider].fields) {
    // An answer of the org is a yes once ticked and a no until then: never an empty field.
    const value =
      kind === 'choice' ? (values[name] === 'true' ? 'true' : 'false') : values[name]?.trim()
    if (!value) return null
    credentials[name] = value
  }
  return Object.keys(credentials).length > 0 ? { provider, credentials } : null
}

const MISSING: Record<string, MessageDescriptor> = {
  'fake.not-ready': msg`The fake provider reports this account as not ready.`,
  'provider.not-loaded': msg`This environment cannot reach the provider of this account.`,
  'credentials.unreadable': msg`The stored credentials can no longer be read. Give them again.`,
  'przelewy24.abandoned-payment-email-on': msg`It is not confirmed that Przelewy24’s own email for an abandoned payment is off. Give the credentials again once it is.`,
  'przelewy24.credentials-invalid': msg`The stored credentials do not name a Przelewy24 account. Give them again.`,
}

/** What a condition of readiness says, or null for one this panel does not know yet. */
export const missingMessage = (code: string): MessageDescriptor | null =>
  Object.hasOwn(MISSING, code) ? MISSING[code]! : null
