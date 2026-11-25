import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MyOrder } from '@opos/contract'
import { formatDateTime, isLocale } from '@opos/i18n'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Link } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { activeLocale } from '../../../shared/lib/i18n'
import { notifyFailure } from '../../../shared/lib/notify'
import { useSession } from '../../../shared/lib/session'
import { Button, buttonVariants, ErrorMessage, Section } from '../../../shared/ui'
import { myOrdersOptions, payNow, resendConfirmation } from '../api/shop'
import { leaveTo } from '../model/leave'
import { ORDER_STATUS_LABELS } from '../model/order-status'
import { OrderLines } from './order-lines'

/** How often the list asks again while an order of it awaits its payment. */
const ASK_AGAIN_MS = 5000

/**
 * The orders of the signed-in account in a convention, on the convention's page
 * (docs/specs/0009-buyer-self-service.md, U1-U4): each with its status and what it holds; a paid
 * one with "Resend QR code" and "Buy more" while its email is the account's, an unpaid one
 * within its hold with "Pay now". A visitor, and an account that bought nothing here, see
 * nothing of it.
 */
export function MyOrders({ tenantSlug, timeZone }: { tenantSlug: string; timeZone: string }) {
  const signedIn = useSession((state) => state.account !== null)
  const orders = useQuery({
    ...myOrdersOptions(tenantSlug),
    enabled: signedIn,
    // A buyer back from the provider sees "Paid" by itself once the payment is confirmed. An
    // order is within its hold by the shop's word, never by the clock of this device.
    refetchInterval: (query) =>
      query.state.data?.some((order) => order.payable) ? ASK_AGAIN_MS : false,
  })

  if (!signedIn) return null
  if (orders.isError) return <ErrorMessage error={orders.error} />
  if (!orders.data || orders.data.length === 0) return null
  return (
    <Section title={<Trans>Your orders</Trans>}>
      <ul className="flex flex-col gap-4">
        {orders.data.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            tenantSlug={tenantSlug}
            timeZone={timeZone}
            // As the shop judged it when the list was last read, which it is again while an
            // order awaits.
            payable={order.payable}
            onChanged={() => void orders.refetch()}
          />
        ))}
      </ul>
    </Section>
  )
}

function OrderRow({
  order,
  tenantSlug,
  timeZone,
  payable,
  onChanged,
}: {
  order: MyOrder
  tenantSlug: string
  timeZone: string
  payable: boolean
  onChanged: () => void
}) {
  const { i18n } = useLingui()
  const headingId = useId()
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  const { number, holderName } = order
  const editionName = order.edition.name
  const placed = formatDateTime(new Date(order.placedAt), locale, timeZone, { dateStyle: 'long' })
  const shop = `/conventions/${tenantSlug}/${order.edition.slug}/shop`

  const resend = useMutation({
    mutationFn: () => resendConfirmation(tenantSlug, order.id),
    meta: { success: msg`We sent the QR code to the email address of the order.` },
    // Moved to another email since the list was read: read again, it offers this no longer.
    onError: (error) => {
      if (errorCode(error) === 'order.passed-on') onChanged()
    },
  })
  const pay = useMutation({
    mutationFn: () => payNow(tenantSlug, order.edition.id, order.id),
    // The buyer leaves for the provider, or the list says what became of the order.
    meta: { success: false, failure: false },
    onSuccess: ({ redirectUrl }) => leaveTo(redirectUrl),
    onError: (error) => {
      const code = errorCode(error)
      // Paid or expired meanwhile: the status says so once the list is read again.
      if (code === 'order.already-paid' || code === 'order.hold-ended') onChanged()
      else notifyFailure(error)
    },
  })

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-medium">
          <Trans>Order {number}</Trans>
        </h3>
        <span className="text-sm font-medium">{i18n._(ORDER_STATUS_LABELS[order.status])}</span>
      </div>
      <p className="text-muted-foreground text-sm">
        {/* Nobody has to be named: an order with no name says its edition and its day alone. */}
        {holderName === '' ? (
          <Trans>
            {editionName}, placed {placed}
          </Trans>
        ) : (
          <Trans>
            {editionName}, placed {placed}, for {holderName}
          </Trans>
        )}
      </p>
      <OrderLines lines={order.lines} totalMinor={order.totalMinor} currency={order.currency} />
      {/* An order an org moved to another email passed to another person: it is listed still,
          and the account it stays on neither has its QR code sent nor adds to it. */}
      {(order.resendable || order.bought) && (
        <div className="flex flex-wrap gap-3">
          {order.resendable && (
            <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
              <Trans>Resend QR code</Trans>
            </Button>
          )}
          {order.bought && (
            <Link
              to={`${shop}/checkout?extends=${order.id}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Trans>Buy more</Trans>
            </Link>
          )}
        </div>
      )}
      {payable && (
        <div>
          <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
            <Trans>Pay now</Trans>
          </Button>
        </div>
      )}
      {order.status === 'awaiting-payment' && !payable && (
        <p className="text-sm">
          <Trans>
            The time to pay for this order has ended. Nothing was charged: start a new order in the
            shop.
          </Trans>
        </p>
      )}
    </li>
  )
}
