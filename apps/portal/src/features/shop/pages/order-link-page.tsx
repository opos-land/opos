import { Trans, useLingui } from '@lingui/react/macro'
import { type LinkedOrder } from '@opos/contract'
import { formatDateTime, isLocale } from '@opos/i18n'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { activeLocale } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  linkClass,
  LoadingView,
  Notice,
  Page,
  Section,
} from '../../../shared/ui'
import { openOrderLink, renewOrderLink } from '../api/shop'
import { OrderLines } from '../components/order-lines'
import { OrderQrCode } from '../components/order-qr-code'
import { tokenFromHash } from '../model/order-link'
import { ORDER_STATUS_LABELS } from '../model/order-status'

/**
 * The page an order link opens (docs/specs/0009-buyer-self-service.md, K1-K4): one order, shown
 * to whoever holds the link from its email, with no sign-in. Nothing on it can be changed. An
 * expired link shows nothing of the order and has a fresh one sent to the order's email.
 */
export function OrderLinkPage() {
  const { t } = useLingui()
  const location = useLocation()
  usePageTitle(t`Your order`)
  // The token stays after the `#`, where the email put it: a reload opens the order again.
  const token = tokenFromHash(location.hash)
  const opened = useQuery({
    // Kept in memory alone, and dropped with the page: another link opens another order.
    queryKey: ['order-link', token],
    queryFn: () => openOrderLink(token ?? ''),
    enabled: token !== null,
    retry: false,
    // An order opened once is not asked for again by itself: each opening counts against a limit.
    staleTime: Infinity,
    gcTime: 0,
  })

  if (token === null || (opened.isError && isNotFound(opened.error))) {
    return (
      <Page title={<Trans>We cannot open this order</Trans>}>
        <p>
          <Trans>
            This link does not open an order. Use the link from the newest email about your order:
            an earlier one stops working when the email address of the order changes.
          </Trans>
        </p>
      </Page>
    )
  }
  if (opened.isError) return <ErrorMessage error={opened.error} />
  if (opened.isPending) return <LoadingView />
  if (opened.data.state === 'expired') return <Expired token={token} />
  return <Opened order={opened.data.order} />
}

/** The order itself, read-only. */
function Opened({ order }: { order: LinkedOrder }) {
  const { i18n } = useLingui()
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  const { number, convention, edition } = order
  const placed = formatDateTime(new Date(order.placedAt), locale, convention.timezone, {
    dateStyle: 'long',
  })

  return (
    <Page
      title={<Trans>Order {number}</Trans>}
      lead={
        <Link to={`/conventions/${convention.slug}/${edition.slug}`} className={linkClass}>
          {edition.name}
        </Link>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">
          <Trans>Status</Trans>
        </dt>
        <dd className="font-medium">{i18n._(ORDER_STATUS_LABELS[order.status])}</dd>
        <dt className="text-muted-foreground">
          <Trans>Placed</Trans>
        </dt>
        <dd>{placed}</dd>
      </dl>
      {order.qrCode && (
        <Section title={<Trans>Your QR code</Trans>}>
          <OrderQrCode number={number} code={order.qrCode} />
        </Section>
      )}
      <Section title={<Trans>What the order holds</Trans>}>
        <OrderLines lines={order.lines} totalMinor={order.totalMinor} currency={order.currency} />
      </Section>
      {order.pickupInformation && (
        <Section title={<Trans>Picking up merchandise</Trans>}>
          <p className="whitespace-pre-line">{order.pickupInformation}</p>
        </Section>
      )}
    </Page>
  )
}

/**
 * An expired link: nothing of its order, and a fresh link on request. The answer is the same
 * whatever the token was, so the page says the same whatever came of the request.
 */
function Expired({ token }: { token: string }) {
  const [asked, setAsked] = useState(false)
  const renew = useMutation({
    mutationFn: () => renewOrderLink(token),
    // The page says what came of it itself; a failure, such as too many requests, is notified.
    meta: { success: false },
    onSuccess: () => setAsked(true),
  })

  return (
    <Page title={<Trans>This link has expired</Trans>}>
      <p>
        <Trans>
          A link to an order works for a limited time. We can send a new one to the email address of
          the order.
        </Trans>
      </p>
      {asked ? (
        <Notice>
          <Trans>
            If this link belonged to an order, a new link is on its way to the email address of that
            order.
          </Trans>
        </Notice>
      ) : (
        <div>
          <Button onClick={() => renew.mutate()} disabled={renew.isPending}>
            <Trans>Send a new link</Trans>
          </Button>
        </div>
      )}
    </Page>
  )
}
