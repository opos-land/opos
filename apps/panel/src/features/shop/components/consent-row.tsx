import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { type Consent, type EditionDocument } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge, Button, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { removeConsentOptions, shopKey, updateConsentOptions } from '../api/shop'
import { ConsentForm } from './consent-form'

/**
 * One consent in the list of an edition: its sentence, whether the buyer must accept it and the
 * document it links; for a member with tickets=write, its place, its fields, hiding and deletion.
 */
export function ConsentRow({
  consent,
  documents,
  last,
  canWrite,
}: {
  consent: Consent
  documents: EditionDocument[]
  /** Whether it holds the last place of the list. */
  last: boolean
  canWrite: boolean
}) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const params = { editionId: consent.editionId, consentId: consent.id }
  const linked = documents.find((document) => document.id === consent.documentId)
  const linkedTitle = linked?.title ?? ''
  const text = consent.text

  const refresh = () => queryClient.invalidateQueries({ queryKey: shopKey(api) })
  const update = useMutation({
    ...updateConsentOptions(api),
    meta: { success: msg`The consent is saved.` },
    onSuccess: async () => {
      setEditing(false)
      await refresh()
    },
  })
  const remove = useMutation({
    ...removeConsentOptions(api),
    meta: { success: msg`The consent is deleted.` },
    onSuccess: refresh,
  })
  const move = (position: number) => update.mutate({ params, body: { position } })

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm">{consent.text}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {consent.isRequired ? (
          <Badge>
            <Trans context="a consent">Required</Trans>
          </Badge>
        ) : (
          <Badge variant="secondary">
            <Trans context="a consent">Optional</Trans>
          </Badge>
        )}
        {consent.hidden && (
          <Badge variant="outline">
            <Trans context="a consent">Hidden from the shop</Trans>
          </Badge>
        )}
        {linked && (
          <span className="text-muted-foreground">
            <Trans>Links the document: {linkedTitle}</Trans>
          </span>
        )}
      </div>
      {canWrite &&
        (editing ? (
          <ConsentForm
            initial={consent}
            documents={documents}
            pending={update.isPending}
            submitLabel={<Trans>Save the consent</Trans>}
            onSubmit={(body) => update.mutate({ params, body })}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            {consent.position > 1 && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => move(consent.position - 1)}
              >
                <Trans>Move up</Trans>
              </Button>
            )}
            {!last && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => move(consent.position + 1)}
              >
                <Trans>Move down</Trans>
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Trans>Edit</Trans>
            </Button>
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ params, body: { hidden: !consent.hidden } })}
            >
              {consent.hidden ? <Trans>Show in the shop</Trans> : <Trans>Hide from the shop</Trans>}
            </Button>
            <IrreversibleAction
              label={<Trans>Delete the consent</Trans>}
              title={<Trans>Delete this consent?</Trans>}
              action={<Trans>Delete the consent</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>The shop stops asking for it: “{text}”.</Trans>
            </IrreversibleAction>
          </div>
        ))}
    </li>
  )
}
