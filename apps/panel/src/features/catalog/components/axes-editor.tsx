import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { MAX_OPTION_AXES, MAX_OPTION_VALUES, type MerchandiseItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, FormField, Input, IrreversibleAction } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { catalogKey, updateItemOptions } from '../api/catalog'
import { axesBody, axesFields, type AxisFields, reshapes } from '../model/merchandise'

const replaced = <T,>(list: readonly T[], index: number, entry: T) =>
  list.map((held, at) => (at === index ? entry : held))
const without = <T,>(list: readonly T[], index: number) => list.filter((_, at) => at !== index)

/**
 * The option axes of an item, such as its cut and its size, with the values of each, saved as a
 * whole list. Saving axes that take variants away asks first in a modal: once an axis is added or
 * removed no variant fits the axes any more, and a removed value takes the variants that held it.
 */
export function AxesEditor({ item, canWrite }: { item: MerchandiseItem; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [axes, setAxes] = useState<AxisFields[]>(() => axesFields(item))
  const [invalid, setInvalid] = useState(false)
  const params = { editionId: item.editionId, itemId: item.id }
  const update = useMutation({
    ...updateItemOptions(api),
    meta: { success: msg`The axes are saved.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey(api) }),
  })
  const body = axesBody(axes)
  const save = () => {
    setInvalid(!body)
    return body ? update.mutateAsync({ params, body }) : Promise.resolve()
  }
  const setAxis = (index: number, changes: Partial<AxisFields>) =>
    setAxes(replaced(axes, index, { ...axes[index]!, ...changes }))

  if (!canWrite) {
    return item.axes.length === 0 ? (
      <p className="text-sm">
        <Trans>The item has no option axes: it is sold as one variant.</Trans>
      </p>
    ) : (
      <dl className="flex flex-col gap-2 text-sm">
        {item.axes.map((axis) => (
          <div key={axis.id}>
            <dt className="font-medium">{axis.name}</dt>
            <dd>{axis.values.map((value) => value.label).join(', ')}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm">
        <Trans>
          An axis is something a buyer chooses, such as the cut or the size. An item without axes is
          sold as one variant.
        </Trans>
      </p>
      {axes.map((axis, index) => {
        const number = index + 1
        return (
          <fieldset
            key={axis.id ?? `new-${index}`}
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <legend className="px-1 text-sm">
              <Trans>Axis {number}</Trans>
            </legend>
            <FormField label={t`Name of axis ${number}`}>
              {(control) => (
                <Input
                  {...control}
                  value={axis.name}
                  maxLength={50}
                  onChange={(event) => setAxis(index, { name: event.target.value })}
                />
              )}
            </FormField>
            {axis.values.map((value, place) => {
              const order = place + 1
              return (
                <div key={value.id ?? `new-${place}`} className="flex flex-wrap items-end gap-3">
                  <FormField label={t`Value ${order} of axis ${number}`}>
                    {(control) => (
                      <Input
                        {...control}
                        value={value.label}
                        maxLength={50}
                        onChange={(event) =>
                          setAxis(index, {
                            values: replaced(axis.values, place, {
                              ...value,
                              label: event.target.value,
                            }),
                          })
                        }
                      />
                    )}
                  </FormField>
                  <Button
                    variant="outline"
                    onClick={() => setAxis(index, { values: without(axis.values, place) })}
                  >
                    <Trans>
                      Remove value {order} of axis {number}
                    </Trans>
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap gap-3">
              {axis.values.length < MAX_OPTION_VALUES && (
                <Button
                  variant="outline"
                  onClick={() => setAxis(index, { values: [...axis.values, { label: '' }] })}
                >
                  <Trans>Add a value to axis {number}</Trans>
                </Button>
              )}
              <Button variant="outline" onClick={() => setAxes(without(axes, index))}>
                <Trans>Remove axis {number}</Trans>
              </Button>
            </div>
          </fieldset>
        )
      })}
      {invalid && (
        <p className="text-destructive text-sm">
          <Trans>
            Give every axis a name and at least one value, and use each name and each value once.
          </Trans>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {axes.length < MAX_OPTION_AXES && (
          <Button
            variant="outline"
            onClick={() => setAxes([...axes, { name: '', values: [{ label: '' }] }])}
          >
            <Trans>Add an axis</Trans>
          </Button>
        )}
        {body && reshapes(item, axes) ? (
          <IrreversibleAction
            label={<Trans>Save the axes</Trans>}
            title={<Trans>Save the axes and remove variants?</Trans>}
            action={<Trans>Save the axes</Trans>}
            onConfirm={save}
          >
            <Trans>
              Once an axis is added or removed, every variant of the item goes with its stock. A
              removed value takes the variants that held it, and its size chart.
            </Trans>
          </IrreversibleAction>
        ) : (
          <Button disabled={update.isPending} onClick={() => void save()}>
            <Trans>Save the axes</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}
