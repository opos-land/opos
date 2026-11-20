import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AddOn } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import {
  addOnFileOptions,
  catalogKey,
  putAddOnPictureOptions,
  removeAddOnPictureOptions,
} from '../api/catalog'
import { CatalogImage } from './catalog-image'
import { ImagePicker } from './image-picker'

/**
 * The picture of an add-on (docs/specs/0003-catalog.md, A4): one image, which the shop shows with
 * the add-on. Setting one replaces the picture the add-on had; removing it asks first, since the
 * file goes with it.
 */
export function AddOnPicture({ addOn }: { addOn: AddOn }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const params = { editionId: addOn.editionId, addOnId: addOn.id }
  const name = addOn.name
  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const put = useMutation({
    ...putAddOnPictureOptions(api),
    meta: { success: msg`The picture is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeAddOnPictureOptions(api),
    meta: { success: msg`The picture is removed.` },
    onSuccess: refresh,
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm">
        <Trans>
          One picture, which the shop shows with the add-on. It is for everyone once the add-on is
          shown in the shop of a published edition.
        </Trans>
      </p>
      {addOn.picture ? (
        <CatalogImage
          file={addOnFileOptions(api, addOn.editionId, addOn.picture.fileId, 'small')}
          width={addOn.picture.width}
          height={addOn.picture.height}
          alt={t`Picture of ${name}`}
        />
      ) : (
        <p className="text-sm">
          <Trans>The add-on has no picture.</Trans>
        </p>
      )}
      <ImagePicker
        label={t`New picture`}
        submitLabel={
          addOn.picture ? <Trans>Replace the picture</Trans> : <Trans>Set the picture</Trans>
        }
        pending={put.isPending}
        onSubmit={(file) => put.mutateAsync({ params, body: { file } })}
      />
      {addOn.picture && (
        <div>
          <IrreversibleAction
            label={<Trans>Remove the picture</Trans>}
            title={<Trans>Remove the picture of {name}?</Trans>}
            action={<Trans>Remove the picture</Trans>}
            onConfirm={() => remove.mutateAsync({ params })}
          >
            <Trans context="a picture of an add-on">Its file is deleted with it.</Trans>
          </IrreversibleAction>
        </div>
      )}
    </div>
  )
}
