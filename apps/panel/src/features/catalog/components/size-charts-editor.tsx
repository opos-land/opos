import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MerchandiseItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { catalogKey, putSizeChartOptions, removeSizeChartOptions } from '../api/catalog'
import { ImagePicker } from './image-picker'
import { MerchandiseImage } from './merchandise-image'

/**
 * The size charts of an item: an image a value, such as one for each cut, which the shop opens
 * beside the picker of variants. Setting one replaces the chart the value had; removing one asks
 * first, since the file goes with it.
 */
export function SizeChartsEditor({ item, canWrite }: { item: MerchandiseItem; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const put = useMutation({
    ...putSizeChartOptions(api),
    meta: { success: msg`The size chart is saved.` },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeSizeChartOptions(api),
    meta: { success: msg`The size chart is removed.` },
    onSuccess: refresh,
  })

  if (item.axes.length === 0) {
    return (
      <p className="text-sm">
        <Trans>An item without option axes has no size chart.</Trans>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm">
        <Trans>
          A size chart belongs to a value, such as a cut. Give charts to the values of one axis: the
          shop shows the chart of the value a buyer chose.
        </Trans>
      </p>
      {item.axes.flatMap((axis) =>
        axis.values.map((value) => {
          const params = { editionId: item.editionId, itemId: item.id, valueId: value.id }
          const label = `${axis.name}: ${value.label}`
          return (
            <section key={value.id} aria-label={label} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{label}</h3>
              {value.sizeChart ? (
                <MerchandiseImage
                  editionId={item.editionId}
                  fileId={value.sizeChart.fileId}
                  width={value.sizeChart.width}
                  height={value.sizeChart.height}
                  alt={t`Size chart of ${label}`}
                />
              ) : (
                <p className="text-sm">
                  <Trans>No size chart.</Trans>
                </p>
              )}
              {canWrite && (
                <>
                  <ImagePicker
                    label={t`New size chart of ${label}`}
                    submitLabel={
                      value.sizeChart ? (
                        <Trans>Replace the size chart</Trans>
                      ) : (
                        <Trans>Set the size chart</Trans>
                      )
                    }
                    pending={put.isPending}
                    onSubmit={(file) => put.mutateAsync({ params, body: { file } })}
                  />
                  {value.sizeChart && (
                    <div>
                      <IrreversibleAction
                        label={<Trans>Remove the size chart</Trans>}
                        title={<Trans>Remove the size chart of {label}?</Trans>}
                        action={<Trans>Remove the size chart</Trans>}
                        onConfirm={() => remove.mutateAsync({ params })}
                      >
                        <Trans context="a size chart">Its file is deleted with it.</Trans>
                      </IrreversibleAction>
                    </div>
                  )}
                </>
              )}
            </section>
          )
        }),
      )}
    </div>
  )
}
