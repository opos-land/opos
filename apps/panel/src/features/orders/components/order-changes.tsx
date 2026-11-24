import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type OrderDetail } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Button, FormField, Input, IrreversibleAction, Section, Textarea } from '../../../shared/ui'
import { useMoney } from '../../catalog'
import { useCurrentTenant } from '../../tenants'
import {
  cancelOrderOptions,
  changeEmailOptions,
  declineOrderOptions,
  markPaidOptions,
  ordersKey,
  resendConfirmationOptions,
  updateHolderOptions,
} from '../api/orders'
import { REVIEW_CAUSE_LABELS } from '../model/labels'

interface Props {
  editionId: string
  order: OrderDetail
}

/** Reads the order and the list again once a change of the order is written. */
function useRefresh() {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ordersKey(api) })
}

/** The ticket holder's name: only an edit, nothing else changes with it (C1). */
export function HolderForm({ editionId, order }: Props) {
  const { api } = useCurrentTenant()
  const refresh = useRefresh()
  const [name, setName] = useState(order.holderName)
  const save = useMutation({
    ...updateHolderOptions(api),
    meta: {
      success: order.email
        ? msg`The name is saved, and the buyer is told.`
        : msg`The name is saved.`,
    },
    onSuccess: refresh,
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({ params: { editionId, orderId: order.id }, body: { holderName: name } })
  }

  return (
    <Section title={<Trans>Ticket holder’s name</Trans>}>
      <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
        <FormField
          label={<Trans>Ticket holder’s name</Trans>}
          hint={<Trans>Only the name changes: the QR code and everything else stay.</Trans>}
        >
          {(control) => (
            <Input
              {...control}
              value={name}
              maxLength={200}
              required
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <div>
          <Button type="submit" disabled={save.isPending || name.trim() === ''}>
            <Trans>Save the name</Trans>
          </Button>
        </div>
      </form>
    </Section>
  )
}

/**
 * The order's email (C2): a new QR code and a new order link, the old ones stop working, both
 * addresses are told. It cannot be undone, so it asks first in a modal.
 */
export function EmailForm({ editionId, order }: Props) {
  const { api } = useCurrentTenant()
  const refresh = useRefresh()
  const [email, setEmail] = useState('')
  const change = useMutation({
    ...changeEmailOptions(api),
    meta: { success: msg`The email is changed, and both addresses are told.` },
    onSuccess: async () => {
      setEmail('')
      await refresh()
    },
  })
  const { number } = order
  const next = email.trim()

  return (
    <Section title={<Trans>Email of the order</Trans>}>
      <div className="flex max-w-xl flex-col gap-4">
        <FormField
          label={<Trans>New email address</Trans>}
          hint={
            <Trans>
              The only way a ticket passes to another person. The order stays on the account it is
              on.
            </Trans>
          }
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              value={email}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FormField>
        <div>
          <IrreversibleAction
            label={<Trans>Change the email</Trans>}
            title={
              <Trans>
                Move the order {number} to {next}?
              </Trans>
            }
            action={<Trans>Change the email</Trans>}
            disabled={change.isPending || !next.includes('@')}
            onConfirm={() =>
              change.mutateAsync({
                params: { editionId, orderId: order.id },
                body: { email: next },
              })
            }
          >
            <Trans>
              The order gets a new QR code and a new order link, sent to the new address. The QR
              code and the order link sent so far stop working, and the old address is told so.
            </Trans>
          </IrreversibleAction>
        </div>
      </div>
    </Section>
  )
}

/** "Resend QR": the confirmation again, with the same QR code and a fresh order link (S1). */
export function ResendButton({ editionId, order }: Props) {
  const { api } = useCurrentTenant()
  const refresh = useRefresh()
  const resend = useMutation({
    ...resendConfirmationOptions(api),
    meta: { success: msg`The confirmation is on its way to the order’s email.` },
    onSuccess: refresh,
  })
  return (
    <Button
      variant="outline"
      disabled={resend.isPending}
      onClick={() => resend.mutate({ params: { editionId, orderId: order.id } })}
    >
      <Trans>Resend the QR code</Trans>
    </Button>
  )
}

/** A cancellation of a paid order (X1-X4): with a reason, through a modal. */
export function CancelForm({ editionId, order }: Props) {
  const { api } = useCurrentTenant()
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    ...cancelOrderOptions(api),
    meta: { success: msg`The order is canceled.` },
    onSuccess: refresh,
  })
  const { number } = order

  return (
    <Section title={<Trans>Cancel the order</Trans>}>
      <div className="flex max-w-xl flex-col gap-4">
        <FormField
          label={<Trans>Reason of the cancellation</Trans>}
          hint={<Trans>Kept on the order, for the team. The buyer does not see it.</Trans>}
        >
          {(control) => (
            <Textarea
              {...control}
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <div>
          <IrreversibleAction
            label={<Trans>Cancel the order</Trans>}
            title={<Trans>Cancel the order {number}?</Trans>}
            action={<Trans>Cancel the order</Trans>}
            disabled={cancel.isPending || reason.trim() === ''}
            onConfirm={() =>
              cancel.mutateAsync({
                params: { editionId, orderId: order.id },
                body: { reason: reason.trim() },
              })
            }
          >
            {order.email ? (
              <Trans>
                Its QR code stops being valid, what it holds goes back on sale, and the buyer is
                told. OPOS returns no money: returning it is a matter between the convention and the
                buyer, outside OPOS.
              </Trans>
            ) : (
              <Trans>
                What it holds goes back on sale. OPOS returns no money: returning it is a matter
                between the convention and the buyer, outside OPOS.
              </Trans>
            )}
          </IrreversibleAction>
        </div>
      </div>
    </Section>
  )
}

/**
 * What the payments the convention holds add up to beside the order's total, and the difference
 * between them, which the convention settles outside OPOS (docs/specs/0006-order-management.md,
 * R5).
 */
export function PaidAgainstTotal({ order }: Pick<Props, 'order'>) {
  const money = useMoney()
  const difference = Math.abs(order.totalMinor - order.paidMinor)

  return (
    <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt>
        <Trans>Paid</Trans>
      </dt>
      <dd className="text-right tabular-nums">{money.format(order.paidMinor)}</dd>
      <dt>
        <Trans>Total of the order</Trans>
      </dt>
      <dd className="text-right tabular-nums">{money.format(order.totalMinor)}</dd>
      {difference > 0 && (
        <>
          <dt>
            <Trans>Difference</Trans>
          </dt>
          <dd className="text-right tabular-nums">{money.format(difference)}</dd>
        </>
      )}
    </dl>
  )
}

/**
 * An order that needs review (R2-R5): why, what was paid beside the total, and the two ways to
 * settle it.
 */
export function ReviewPanel({ editionId, order, canWrite }: Props & { canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  const params = { editionId, orderId: order.id }
  const markPaid = useMutation({
    ...markPaidOptions(api),
    meta: { success: msg`The order is paid: its QR code is on its way to the buyer.` },
    onSuccess: refresh,
  })
  const decline = useMutation({
    ...declineOrderOptions(api),
    meta: { success: msg`The payment is declined, and the buyer is told.` },
    onSuccess: refresh,
  })
  const { number } = order

  return (
    <Section title={<Trans>This order needs review</Trans>}>
      {order.reviewCause && <p className="text-sm">{t(REVIEW_CAUSE_LABELS[order.reviewCause])}</p>}
      <PaidAgainstTotal order={order} />
      <p className="max-w-2xl text-sm">
        <Trans>
          The money is with the convention. Marked paid, the order stays at its total and gets its
          QR code; a difference is settled with the buyer outside OPOS. An order that holds nothing
          takes again what it held, so raise the stock or the capacity first when that is gone.
        </Trans>
      </p>
      {canWrite && (
        <div className="flex max-w-xl flex-col gap-4">
          <div>
            <Button
              disabled={markPaid.isPending || decline.isPending}
              onClick={() => markPaid.mutate({ params })}
            >
              <Trans>Mark as paid</Trans>
            </Button>
          </div>
          <FormField
            label={<Trans>Reason of the decline</Trans>}
            hint={<Trans>Kept on the order, for the team. The buyer does not see it.</Trans>}
          >
            {(control) => (
              <Textarea
                {...control}
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </FormField>
          <div>
            <IrreversibleAction
              label={<Trans>Decline the payment</Trans>}
              title={<Trans>Decline the payment for the order {number}?</Trans>}
              action={<Trans>Decline the payment</Trans>}
              disabled={decline.isPending || markPaid.isPending || reason.trim() === ''}
              onConfirm={() => decline.mutateAsync({ params, body: { reason: reason.trim() } })}
            >
              <Trans>
                The order holds nothing from then on and never gets a QR code, and the buyer is
                told. OPOS returns no money: returning it is a matter between the convention and the
                buyer, outside OPOS.
              </Trans>
            </IrreversibleAction>
          </div>
        </div>
      )}
    </Section>
  )
}
