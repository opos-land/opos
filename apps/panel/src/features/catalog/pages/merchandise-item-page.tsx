import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type MerchandiseItem } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  IrreversibleAction,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import {
  catalogKey,
  createItemOptions,
  merchandiseOptions,
  removeItemOptions,
  updateItemOptions,
} from '../api/catalog'
import { AxesEditor } from '../components/axes-editor'
import { ItemForm } from '../components/item-form'
import { PicturesEditor } from '../components/pictures-editor'
import { SizeChartsEditor } from '../components/size-charts-editor'
import { VariantsEditor } from '../components/variants-editor'
import { useMoney } from '../hooks/use-money'
import { axesKey, EMPTY_ITEM, itemFields, variantsKey } from '../model/merchandise'

/**
 * One merchandise item (`/editions/:editionSlug/merchandise/:itemId`), or a new one at
 * `merchandise/new`: its fields, its option axes, the variants that exist with their stock, its
 * pictures, its size charts and its deletion. A new item is added with its fields alone; the rest
 * is set on the page it then has. Reading needs tickets>=read in the edition, changing
 * tickets=write.
 */
export function MerchandiseItemPage() {
  const { t } = useLingui()
  const { editionSlug, itemId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const canWrite = atLeast(level, 'write')
  const items = useQuery({ ...merchandiseOptions(api, edition?.id ?? ''), enabled: canRead })
  const isNew = itemId === undefined
  const item = items.data?.find((entry) => entry.id === itemId)
  usePageTitle(
    isNew
      ? t({ context: 'a merchandise item', message: 'New item' })
      : (item?.name ?? t`Merchandise`),
    edition?.name ?? tenant.name,
  )
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/merchandise`

  const refresh = () => queryClient.invalidateQueries({ queryKey: catalogKey(api) })
  const name = item?.name ?? ''
  const create = useMutation({
    ...createItemOptions(api),
    meta: {
      success: (made: MerchandiseItem) => {
        const added = made.name
        return msg`The item “${added}” is added. Set its variants and its pictures.`
      },
    },
    onSuccess: async (made) => {
      await refresh()
      void navigate(`${base}/${made.id}`, { replace: true })
    },
  })
  const update = useMutation({
    ...updateItemOptions(api),
    meta: { success: msg({ context: 'a merchandise item', message: 'The item is saved.' }) },
    onSuccess: refresh,
  })
  const remove = useMutation({
    ...removeItemOptions(api),
    meta: { success: msg`The item “${name}” is deleted.` },
    onSuccess: async () => {
      await refresh()
      void navigate(base, { replace: true })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead || (isNew && !canWrite)) return <NoPermissionView />
  if (items.isPending) return <LoadingView />
  if (items.isError) return <ErrorMessage error={items.error} />
  if (!isNew && !item) return <NotFoundView />

  const back = (
    <p className="text-sm">
      <Link to={base} className="text-primary underline">
        <Trans>All merchandise</Trans>
      </Link>
    </p>
  )
  if (!item) {
    return (
      <>
        <PageHeader
          title={<Trans context="a merchandise item">New item</Trans>}
          description={edition.name}
        />
        {back}
        <Section title={<Trans context="a merchandise item">Item data</Trans>}>
          <ItemForm
            initial={EMPTY_ITEM}
            pending={create.isPending}
            submitLabel={<Trans context="a merchandise item">Add the item</Trans>}
            onSubmit={(body) => create.mutate({ params: { editionId: edition.id }, body })}
          />
        </Section>
      </>
    )
  }

  const params = { editionId: edition.id, itemId: item.id }
  return (
    <>
      <PageHeader title={item.name} description={edition.name} />
      {back}
      <Section title={<Trans context="a merchandise item">Item data</Trans>}>
        <ItemForm
          key={JSON.stringify(itemFields(item, money.toInput))}
          initial={itemFields(item, money.toInput)}
          disabled={!canWrite}
          pending={update.isPending}
          submitLabel={<Trans context="a merchandise item">Save the item</Trans>}
          onSubmit={(body) => update.mutate({ params, body })}
        />
      </Section>
      <Section title={<Trans>Option axes</Trans>}>
        {/* What the API answered fills each editor anew once what that editor holds changed. */}
        <AxesEditor key={axesKey(item)} item={item} canWrite={canWrite} />
      </Section>
      <Section title={<Trans>Variants and stock</Trans>}>
        <VariantsEditor key={variantsKey(item)} item={item} canWrite={canWrite} />
      </Section>
      <Section title={<Trans>Pictures</Trans>}>
        <PicturesEditor item={item} canWrite={canWrite} />
      </Section>
      <Section title={<Trans>Size charts</Trans>}>
        <SizeChartsEditor item={item} canWrite={canWrite} />
      </Section>
      {canWrite && (
        <Section title={<Trans context="a merchandise item">Delete the item</Trans>}>
          <p className="text-sm">
            <Trans>
              Deleting an item cannot be undone. To take it out of the shop for a while, hide it in
              the list of merchandise instead.
            </Trans>
          </p>
          <div>
            <IrreversibleAction
              label={<Trans context="a merchandise item">Delete the item</Trans>}
              title={<Trans>Delete the item “{name}”?</Trans>}
              action={<Trans context="a merchandise item">Delete the item</Trans>}
              onConfirm={() => remove.mutateAsync({ params })}
            >
              <Trans>
                Its variants with their stock, its pictures and its size charts go with it.
              </Trans>
            </IrreversibleAction>
          </div>
        </Section>
      )}
    </>
  )
}
