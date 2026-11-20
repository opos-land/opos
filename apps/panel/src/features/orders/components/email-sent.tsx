import { Trans } from '@lingui/react/macro'
import { type OrderEmailSummary } from '@opos/contract'
import { useTenantTime } from '../../tenants'

/**
 * When an email of an order went out, or why it has not: withdrawn because the order left its
 * address, tried again after a failed send, or waiting for its first try.
 */
export function EmailSent({
  email,
}: {
  email: Pick<OrderEmailSummary, 'sentAt' | 'withdrawnAt' | 'failedAttempts'>
}) {
  const time = useTenantTime()
  if (email.withdrawnAt) {
    return <Trans>Not sent: the order moved to another address before it went out</Trans>
  }
  if (email.sentAt) return <>{time.format(email.sentAt)}</>
  return email.failedAttempts > 0 ? (
    <Trans>Not sent yet: it is tried again</Trans>
  ) : (
    <Trans>Waiting to be sent</Trans>
  )
}
