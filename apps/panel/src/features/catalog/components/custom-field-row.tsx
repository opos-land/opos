import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type CustomField } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Badge, Button, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { catalogKey, removeCustomFieldOptions, updateCustomFieldOptions } from '../api/catalog'
import { CustomFieldForm } from './custom-field-form'
import { ListActions } from './list-actions'

/**
 * One custom field in the list of an edition: what it asks and whether an answer is required; for
 * a member with tickets=write, its place, its fields, hiding and deletion.
 */
export function CustomFieldRow({
  field,
  last,
  canWrite,
}: {
  field: CustomField
  last: boolean
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const headingId = useId()
  const [editing, setEditing] = useState(false)
  const params = { editionId: field.editionId, fieldId: field.id }
  const label = field.label

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const update = useMutation({
    ...updateCustomFieldOptions(api),
    meta: { success: msg`The custom field is saved.` },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
    },
  })
  const remove = useMutation({
    ...removeCustomFieldOptions(api),
    meta: { success: msg`The custom field “${label}” is deleted.` },
    onSuccess: refresh,
  })

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-medium">
          {field.label}
        </h3>
        {field.isRequired ? (
          <Badge>
            <Trans context="a custom field">Required</Trans>
          </Badge>
        ) : (
          <Badge variant="secondary">
            <Trans context="a custom field">Optional</Trans>
          </Badge>
        )}
        {field.hidden && (
          <Badge variant="outline">
            <Trans context="a custom field">Hidden from the shop</Trans>
          </Badge>
        )}
      </div>
      {canWrite &&
        (editing ? (
          <CustomFieldForm
            initial={field}
            pending={update.isPending}
            submitLabel={t`Save the custom field`}
            onSubmit={(body) => update.mutate({ params, body })}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            <ListActions
              position={field.position}
              last={last}
              hidden={field.hidden}
              pending={update.isPending}
              onMove={(position) => update.mutate({ params, body: { position } })}
              onHide={(hidden) => update.mutate({ params, body: { hidden } })}
            />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Trans>Edit</Trans>
            </Button>
            <IrreversibleAction
              label={<Trans>Delete the custom field</Trans>}
              title={<Trans>Delete the custom field “{label}”?</Trans>}
              action={<Trans>Delete the custom field</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>
                The shop stops asking for it. To stop asking for a while, hide it instead.
              </Trans>
            </IrreversibleAction>
          </div>
        ))}
    </li>
  )
}
