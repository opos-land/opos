import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AddOn } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Badge, Button, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { catalogKey, removeAddOnOptions, updateAddOnOptions } from '../api/catalog'
import { useMoney } from '../hooks/use-money'
import { addOnFields } from '../model/add-on-form'
import { AddOnForm } from './add-on-form'
import { ListActions } from './list-actions'

/**
 * One add-on in the list of an edition: its name, its price and what limits it; for a member with
 * tickets=write, its place, its fields, hiding and deletion.
 */
export function AddOnRow({
  addOn,
  last,
  canWrite,
}: {
  addOn: AddOn
  last: boolean
  canWrite: boolean
}) {
  const { i18n } = useLingui()
  const { api } = useCurrentTenant()
  const money = useMoney()
  const queryClient = useQueryClient()
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const params = { editionId: addOn.editionId, addOnId: addOn.id }
  const name = addOn.name
  const capacity = i18n.number(addOn.capacity ?? 0)

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const update = useMutation({
    ...updateAddOnOptions(api),
    meta: { success: msg`The add-on is saved.` },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
    },
  })
  const remove = useMutation({
    ...removeAddOnOptions(api),
    meta: { success: msg`The add-on “${name}” is deleted.` },
    onSuccess: refresh,
  })

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-medium">
          {addOn.name}
        </h3>
        <span className="text-sm">
          {addOn.amountMinor === 0 ? (
            <Trans context="a price">Free</Trans>
          ) : (
            money.format(addOn.amountMinor)
          )}
        </span>
        <Badge variant="secondary">
          {addOn.kind === 'limited' ? (
            <Trans>Limited places: {capacity}</Trans>
          ) : addOn.kind === 'headcount' ? (
            <Trans>Headcount only</Trans>
          ) : (
            <Trans>No limit</Trans>
          )}
        </Badge>
        {addOn.hidden && (
          <Badge variant="outline">
            <Trans context="an add-on">Hidden from the shop</Trans>
          </Badge>
        )}
      </div>
      {addOn.description && <p className="text-sm">{addOn.description}</p>}
      {canWrite &&
        (editing ? (
          <AddOnForm
            initial={addOnFields(addOn, money.toInput)}
            pending={update.isPending}
            submitLabel={<Trans>Save the add-on</Trans>}
            onSubmit={(body) => update.mutate({ params, body })}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            <ListActions
              position={addOn.position}
              last={last}
              hidden={addOn.hidden}
              pending={update.isPending}
              onMove={(position) => update.mutate({ params, body: { position } })}
              onHide={(hidden) => update.mutate({ params, body: { hidden } })}
            />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Trans>Edit</Trans>
            </Button>
            <IrreversibleAction
              label={<Trans>Delete the add-on</Trans>}
              title={<Trans>Delete the add-on “{name}”?</Trans>}
              action={<Trans>Delete the add-on</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>
                The shop stops offering it, and no ticket type offers it any more. To take it out of
                the shop for a while, hide it instead.
              </Trans>
            </IrreversibleAction>
          </div>
        ))}
    </li>
  )
}
