import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { type PaymentProvider } from '@opos/contract'

/** A field of the credentials a provider's module asks for. */
export interface CredentialField {
  name: string
  label: MessageDescriptor
  hint?: MessageDescriptor
}

/**
 * The providers as the panel shows them: a name and the fields of their credentials. Which of
 * them an account may be connected to is the API's to say, by environment.
 */
export const PROVIDERS: Record<
  PaymentProvider,
  { name: MessageDescriptor; fields: CredentialField[] }
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
  // Its fields come with its module.
  przelewy24: { name: msg`Przelewy24`, fields: [] },
}

export const emptyCredentials = (provider: PaymentProvider): Record<string, string> =>
  Object.fromEntries(PROVIDERS[provider].fields.map((field) => [field.name, '']))

/** The body that connects an account, or null while a field of the provider is empty. */
export function credentialsBody(provider: PaymentProvider, values: Record<string, string>) {
  const credentials: Record<string, string> = {}
  for (const { name } of PROVIDERS[provider].fields) {
    const value = values[name]?.trim()
    if (!value) return null
    credentials[name] = value
  }
  return Object.keys(credentials).length > 0 ? { provider, credentials } : null
}

const MISSING: Record<string, MessageDescriptor> = {
  'fake.not-ready': msg`The fake provider reports this account as not ready.`,
  'provider.not-loaded': msg`This environment cannot reach the provider of this account.`,
  'credentials.unreadable': msg`The stored credentials can no longer be read. Give them again.`,
}

/** What a condition of readiness says, or null for one this panel does not know yet. */
export const missingMessage = (code: string): MessageDescriptor | null =>
  Object.hasOwn(MISSING, code) ? MISSING[code]! : null
