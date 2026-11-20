import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type OrderDetail, type OrderLine } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Button,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { merchandiseOptions, useMoney } from '../../catalog'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import {
  handOutOptions,
  ordersKey,
  swapVariantOptions,
  takeBackHandOutOptions,
} from '../api/orders'

/** A line under the name of what it sells, a variant with its values. */
const nameOf = (line: OrderLine) =>
  line.variant.length > 0 ? `${line.name} (${line.variant.join(', ')})` : line.name

/**
 * The lines of an order with their prices and their hand-out marks. On a paid order an org with
 * write access marks a line handed out or takes the mark back, for a buyer whose QR code cannot
 * be read, and swaps a merchandise line for another variant of its item
 * (docs/specs/0006-order-management.md, C4, H1 and H2).
 */
export function OrderLines({
  editionId,
  order,
  canChange,
}: {
  editionId: string
  order: OrderDetail
  /** Whether the member may write and the order is one that is corrected and handed out. */
  canChange: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const time = useTenantTime()
  const money = useMoney()
  const queryClient = useQueryClient()
  const params = { editionId, orderId: order.id }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ordersKey(api) })
  const handOut = useMutation({
    ...handOutOptions(api),
    meta: { success: msg`The hand-out is marked.` },
    onSuccess: refresh,
  })
  const takeBack = useMutation({
    ...takeBackHandOutOptions(api),
    meta: { success: msg`The hand-out mark is taken back.` },
    onSuccess: refresh,
  })
  const pending = handOut.isPending || takeBack.isPending

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">
            <Trans>Item</Trans>
          </TableHead>
          <TableHead scope="col" className="text-right">
            <Trans>Quantity</Trans>
          </TableHead>
          <TableHead scope="col" className="text-right">
            <Trans>Amount</Trans>
          </TableHead>
          <TableHead scope="col">
            <Trans>Handed out</Trans>
          </TableHead>
          {canChange && (
            <TableHead scope="col">
              <Trans>Actions</Trans>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {order.lines.map((line) => {
          const name = line.kind === 'discount' ? t`Discount` : nameOf(line)
          return (
            <TableRow key={line.id}>
              <TableCell>{name}</TableCell>
              <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money.format(line.amountMinor)}
              </TableCell>
              <TableCell>
                {line.kind === 'discount'
                  ? null
                  : line.handedOutAt
                    ? time.format(line.handedOutAt)
                    : t`Not yet`}
              </TableCell>
              {canChange && (
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {line.kind === 'discount' ? null : line.handedOutAt ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        aria-label={t`Take back the hand-out of ${line.name}`}
                        onClick={() => takeBack.mutate({ params: { ...params, lineId: line.id } })}
                      >
                        <Trans>Take back</Trans>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        aria-label={t`Mark ${line.name} as handed out`}
                        onClick={() => handOut.mutate({ params, body: { lineIds: [line.id] } })}
                      >
                        <Trans>Mark as handed out</Trans>
                      </Button>
                    )}
                    {line.merchandiseItemId && line.variantId && (
                      <VariantSwap
                        editionId={editionId}
                        orderId={order.id}
                        line={line}
                        itemId={line.merchandiseItemId}
                        variantId={line.variantId}
                      />
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2} className="font-medium">
            <Trans>Total</Trans>
          </TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {money.format(order.totalMinor)}
          </TableCell>
          <TableCell colSpan={canChange ? 2 : 1} />
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/** Another variant of the line's item: offered while the item has more than one. */
function VariantSwap({
  editionId,
  orderId,
  line,
  itemId,
  variantId,
}: {
  editionId: string
  orderId: string
  line: OrderLine
  itemId: string
  variantId: string
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const items = useQuery(merchandiseOptions(api, editionId))
  const [chosen, setChosen] = useState(variantId)
  const swap = useMutation({
    ...swapVariantOptions(api),
    meta: { success: msg`The variant is swapped, and the buyer is told.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ordersKey(api) }),
  })
  const item = items.data?.find((held) => held.id === itemId)
  const variants = (item?.variants ?? []).filter(
    (variant) => !variant.hidden || variant.id === variantId,
  )
  if (!item || variants.length < 2) return null

  return (
    <>
      <NativeSelect
        aria-label={t`Variant of ${line.name}`}
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
      >
        {variants.map((variant) => (
          <NativeSelectOption key={variant.id} value={variant.id}>
            {item.axes
              .flatMap(
                (axis) =>
                  axis.values.find((value) => variant.valueIds.includes(value.id))?.label ?? [],
              )
              .join(', ') || item.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        size="sm"
        disabled={swap.isPending || chosen === variantId}
        onClick={() =>
          swap.mutate({
            params: { editionId, orderId, lineId: line.id },
            body: { variantId: chosen },
          })
        }
      >
        <Trans>Swap the variant</Trans>
      </Button>
    </>
  )
}
