import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type DiscountCode } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Badge, Button, IrreversibleAction } from '../../../shared/ui'
import { useMoney } from '../../catalog'
import { useCurrentTenant, useTenantTime } from '../../tenants'
import {
  discountCodesKey,
  removeDiscountCodeOptions,
  updateDiscountCodeOptions,
} from '../api/discount-codes'
import {
  discountCodeFields,
  shownCode,
  type Standing,
  standingOf,
} from '../model/discount-code-form'
import { type CodeCatalog, DiscountCodeForm } from './discount-code-form'

/**
 * One discount code in the list of an edition (docs/specs/0008-discount-codes.md, D4-D6): its
 * value, the uses orders hold against its limit, its window, what it applies to and whether it
 * can be used now; for a member with tickets=write, its fields, ending it and deleting it. Ending
 * is undone on the same screen and asks nothing; deleting asks first.
 */
export function DiscountCodeRow({
  editionId,
  code,
  catalog,
  canWrite,
}: {
  editionId: string
  code: DiscountCode
  catalog: CodeCatalog
  canWrite: boolean
}) {
  const { t, i18n } = useLingui()
  const { api } = useCurrentTenant()
  const money = useMoney()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const params = { editionId, codeId: code.id }
  const name = shownCode(code.code)
  const uses = i18n.number(code.uses)
  const limit = i18n.number(code.usageLimit ?? 0)
  const window = time.range(code.validFrom, code.validUntil)
  const standings: Record<Standing, string> = {
    active: t({ message: 'Active', context: 'a discount code' }),
    ended: t({ message: 'Ended', context: 'a discount code' }),
    expired: t({ message: 'Expired', context: 'a discount code' }),
    'not-yet': t({ message: 'Not valid yet', context: 'a discount code' }),
    'used-up': t({ message: 'Used up', context: 'a discount code' }),
  }
  const standing = standingOf(code, new Date())
  const applies = [
    ...catalog.ticketTypes.filter((type) => code.ticketTypeIds.includes(type.id)),
    ...catalog.addOns.filter((addOn) => code.addOnIds.includes(addOn.id)),
    ...catalog.items.filter((item) => code.itemIds.includes(item.id)),
  ]
    .map((sold) => sold.name)
    .join(', ')

  const refresh = () => queryClient.invalidateQueries({ queryKey: discountCodesKey(api) })
  const update = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code is saved.` },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
    },
  })
  const end = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” is ended.` },
    onSuccess: refresh,
  })
  const resume = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” can be used again.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” is deleted.` },
    onSuccess: refresh,
  })

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-mono font-medium">
          {name}
        </h3>
        <span className="text-sm">
          {code.kind === 'percent'
            ? i18n.number((code.percent ?? 0) / 100, { style: 'percent' })
            : money.format(code.amountMinor ?? 0)}
        </span>
        <Badge variant={standing === 'active' ? 'secondary' : 'outline'}>
          {standings[standing]}
        </Badge>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          {code.usageLimit === null ? (
            <Trans>Uses: {uses}, no limit</Trans>
          ) : (
            <Trans>
              Uses: {uses} of {limit}
            </Trans>
          )}
        </li>
        <li>
          <Trans>Valid: {window}</Trans>
        </li>
        <li>
          <Trans>Applies to: {applies}</Trans>
        </li>
      </ul>
      {canWrite &&
        (editing ? (
          <DiscountCodeForm
            initial={discountCodeFields(code, {
              toInput: money.toInput,
              toInputTime: time.toInput,
            })}
            catalog={catalog}
            pending={update.isPending}
            submitLabel={<Trans>Save the code</Trans>}
            onSubmit={(body) => update.mutate({ params, body })}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Trans>Edit</Trans>
            </Button>
            {code.ended ? (
              <Button
                variant="outline"
                disabled={resume.isPending}
                onClick={() => resume.mutate({ params, body: { ended: false } })}
              >
                <Trans>Let it run again</Trans>
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={end.isPending}
                onClick={() => end.mutate({ params, body: { ended: true } })}
              >
                <Trans>End the code</Trans>
              </Button>
            )}
            <IrreversibleAction
              label={<Trans>Delete the code</Trans>}
              title={<Trans>Delete the code “{name}”?</Trans>}
              action={<Trans>Delete the code</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>
                Buyers can no longer use it. A code an order used cannot be deleted: end it instead,
                and it stays on its orders.
              </Trans>
            </IrreversibleAction>
          </div>
        ))}
    </li>
  )
}
