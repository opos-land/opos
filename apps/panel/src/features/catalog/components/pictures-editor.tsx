import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { MAX_ITEM_PICTURES, type MerchandiseItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { Button, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import {
  addPictureOptions,
  catalogKey,
  removePictureOptions,
  updateItemOptions,
} from '../api/catalog'
import { ImagePicker } from './image-picker'
import { MerchandiseImage } from './merchandise-image'

/**
 * The pictures of an item in the order the shop shows them, the first one in its listing. A
 * picture is added and removed one at a time, each with its file; removing one asks first, since
 * the file goes with it.
 */
export function PicturesEditor({ item, canWrite }: { item: MerchandiseItem; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const listId = useId()
  const params = { editionId: item.editionId, itemId: item.id }
  const name = item.name
  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const add = useMutation({
    ...addPictureOptions(api),
    meta: { success: msg`The picture is added.` },
    onSuccess: refresh,
  })
  const order = useMutation({
    ...updateItemOptions(api),
    meta: { success: msg`The order of the pictures is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removePictureOptions(api),
    meta: { success: msg`The picture is removed.` },
    onSuccess: refresh,
  })
  /** The picture at `from` takes the place at `to`, and the one there takes its own. */
  const swap = (from: number, to: number) => {
    const pictureIds = item.pictures.map((picture) => picture.id)
    ;[pictureIds[from], pictureIds[to]] = [pictureIds[to]!, pictureIds[from]!]
    order.mutate({ params, body: { pictureIds } })
  }

  return (
    <div className="flex flex-col gap-4">
      {item.pictures.length === 0 ? (
        <p className="text-sm">
          <Trans>The item has no pictures yet.</Trans>
        </p>
      ) : (
        <>
          <h3 id={listId} className="sr-only">
            <Trans>Pictures in their order</Trans>
          </h3>
          <ol aria-labelledby={listId} className="flex flex-col gap-3">
            {item.pictures.map((picture, index) => {
              const number = index + 1
              return (
                <li key={picture.id} className="flex flex-wrap items-center gap-4">
                  <MerchandiseImage
                    editionId={item.editionId}
                    fileId={picture.fileId}
                    width={picture.width}
                    height={picture.height}
                    alt={t`Picture ${number} of ${name}`}
                  />
                  {canWrite && (
                    <div className="flex flex-wrap gap-3">
                      {index > 0 && (
                        <Button
                          variant="outline"
                          disabled={order.isPending}
                          onClick={() => swap(index, index - 1)}
                        >
                          <Trans>Move picture {number} up</Trans>
                        </Button>
                      )}
                      {index < item.pictures.length - 1 && (
                        <Button
                          variant="outline"
                          disabled={order.isPending}
                          onClick={() => swap(index, index + 1)}
                        >
                          <Trans>Move picture {number} down</Trans>
                        </Button>
                      )}
                      <IrreversibleAction
                        label={<Trans>Remove picture {number}</Trans>}
                        title={<Trans>Remove picture {number}?</Trans>}
                        action={<Trans>Remove the picture</Trans>}
                        onConfirm={() =>
                          remove.mutateAsync({ params: { ...params, pictureId: picture.id } })
                        }
                      >
                        <Trans>Its file is deleted with it.</Trans>
                      </IrreversibleAction>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
      {canWrite &&
        (item.pictures.length < MAX_ITEM_PICTURES ? (
          <ImagePicker
            label={t`New picture`}
            submitLabel={<Trans>Add the picture</Trans>}
            pending={add.isPending}
            onSubmit={(file) => add.mutateAsync({ params, body: { file } })}
          />
        ) : (
          <p className="text-sm">
            <Trans>The item holds the most pictures it can: ten.</Trans>
          </p>
        ))}
    </div>
  )
}
