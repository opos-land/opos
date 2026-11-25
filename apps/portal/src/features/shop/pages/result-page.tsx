import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type FailureReason } from '@opos/contract'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { errorCode, isNotFound } from '../../../shared/lib/errors'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  buttonVariants,
  ErrorMessage,
  linkClass,
  LoadingView,
  Notice,
  Page,
} from '../../../shared/ui'
import { orderResultOptions, startPaymentAttemptByToken } from '../api/shop'
import { useSentence } from '../hooks/use-money'
import { leaveTo } from '../model/leave'
import { resultToken } from '../model/result-token'

/** How often the page asks again while the payment is not confirmed. */
const ASK_AGAIN_MS = 3000

/** Why an attempt failed, as the shop's own short list words it. */
const FAILURES: Record<FailureReason, MessageDescriptor> = {
  declined: msg`The payment was declined.`,
  'insufficient-funds': msg`There was not enough money to pay.`,
  'wrong-code': msg`The code was wrong.`,
  'timed-out': msg`The payment took too long.`,
  canceled: msg`The payment was canceled.`,
  failed: msg`The payment failed.`,
}

/**
 * The result of an order (docs/specs/0004-checkout-and-orders.md, R1-R5): its status and number
 * alone, opened with the order's result token. The buyer's return is never proof of payment: the
 * page says "Paid" only once the provider confirmed, and asks again by itself until then.
 */
export function ResultPage() {
  const { t, i18n } = useLingui()
  const { tenantSlug = '', editionSlug = '', orderId = '' } = useParams()
  usePageTitle(t`Your order`)
  // Read once: the address is cleaned of the token as it is taken.
  const [token] = useState(() => resultToken(orderId))
  const sentence = useSentence()
  const shop = `/conventions/${tenantSlug}/${editionSlug}/shop`
  const result = useQuery({
    ...orderResultOptions(tenantSlug, orderId, token ?? ''),
    enabled: token !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'awaiting-payment' ? ASK_AGAIN_MS : false,
  })
  const again = useMutation({
    mutationFn: () => startPaymentAttemptByToken(tenantSlug, orderId, token ?? ''),
    // The page shows what came of it itself.
    meta: { success: false, failure: false },
    onSuccess: ({ redirectUrl }) => leaveTo(redirectUrl),
    onError: (error) => {
      const code = errorCode(error)
      // Paid or expired meanwhile: the status says so once it is read again.
      if (code === 'order.already-paid' || code === 'order.hold-ended') void result.refetch()
      else notifyFailure(error)
    },
  })

  if (token === null || (result.isError && isNotFound(result.error))) {
    return (
      <Page title={<Trans>Your order</Trans>}>
        <Notice>
          <Trans>
            We cannot show this order here. The page opens in the browser the order was placed in,
            for 24 hours. Its confirmation comes by email once it is paid.
          </Trans>
        </Notice>
        <Link to={shop} className={linkClass}>
          <Trans>Go to the shop</Trans>
        </Link>
      </Page>
    )
  }
  if (result.isError) return <ErrorMessage error={result.error} />
  if (result.isPending) return <LoadingView />

  // `payable` is the shop's word, by its own clock, on whether another try would start: the
  // clock of this device is not asked. It is as fresh as the status, read every few seconds.
  const { status, number, payable, failureReason, moneyWith } = result.data
  const numberLine = (
    <p>
      <Trans>
        Order number: <strong>{number}</strong>
      </Trans>
    </p>
  )

  if (status === 'paid' || status === 'paid-manual') {
    return (
      <Page title={<Trans>Paid</Trans>}>
        {numberLine}
        <p>
          <Trans>We sent the QR code of your order to your email address.</Trans>
        </p>
      </Page>
    )
  }
  if (status === 'awaiting-payment' && payable) {
    return (
      <Page title={<Trans>Not paid yet</Trans>}>
        {numberLine}
        {failureReason ? (
          <Notice>{i18n._(FAILURES[failureReason])}</Notice>
        ) : (
          <p aria-live="polite">
            <Trans>
              We have no confirmation of your payment yet. This page updates by itself once the
              payment is confirmed.
            </Trans>
          </p>
        )}
        <div>
          <Button onClick={() => again.mutate()} disabled={again.isPending}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      </Page>
    )
  }
  if (status === 'awaiting-payment' || status === 'expired') {
    return (
      <Page title={<Trans>The order expired</Trans>}>
        {numberLine}
        <p>
          <Trans>The time to pay for this order has ended. Nothing was charged.</Trans>
        </p>
        <div>
          <Link to={shop} className={buttonVariants()}>
            <Trans>Start a new order</Trans>
          </Link>
        </div>
      </Page>
    )
  }
  if (status === 'needs-review') {
    return (
      <Page title={<Trans>Your payment is under review</Trans>}>
        {numberLine}
        <p>
          <Trans>Your payment arrived, but it could not confirm the order.</Trans>
        </p>
        {moneyWith && <Notice>{sentence(moneyWith)}</Notice>}
        <p>
          <Trans>An organizer will get in touch with you. You do not need to pay again.</Trans>
        </p>
      </Page>
    )
  }
  return (
    <Page title={status === 'canceled' ? <Trans>Canceled</Trans> : <Trans>Declined</Trans>}>
      {numberLine}
      <p>
        <Trans>This order is closed. If you have questions, contact the convention.</Trans>
      </p>
    </Page>
  )
}
