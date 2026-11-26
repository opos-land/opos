import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EditionShop, type MerchandiseItem } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { changedFrom } from '../../../shared/lib/changes'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
  buttonVariants,
  ErrorMessage,
  FieldSet,
  FormField,
  Input,
  LinkRow,
  LoadingView,
  NativeSelect,
  NativeSelectOption,
  NoPermissionView,
  PageHeader,
  RowLink,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { editionShopOptions, updateEditionShopOptions } from '../../shop'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { catalogKey, merchandiseOptions, updateItemOptions } from '../api/catalog'
import { ListActions } from '../components/list-actions'
import { useMoney } from '../hooks/use-money'

/**
 * The merchandise of an edition (`/editions/:editionSlug/merchandise`): how it sells, with the
 * pre-order deadline and merch-only orders, and its items in the order the shop shows them.
 * Reading needs tickets>=read in the edition, changing tickets=write.
 */
export function MerchandisePage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Merchandise`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const shop = useQuery({ ...editionShopOptions(api, edition?.id ?? ''), enabled: canRead })
  const items = useQuery({ ...merchandiseOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const base = `/${tenant.slug}/editions/${edition.slug}/merchandise`
  return (
    <>
      <PageHeader
        title={<Trans>Merchandise</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link to={`${base}/new`} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              <Trans context="a merchandise item">New item</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>How merchandise sells</Trans>}>
        {shop.isPending ? (
          <LoadingView />
        ) : shop.isError ? (
          <ErrorMessage error={shop.error} />
        ) : (
          <Selling
            // What the edition holds by now fills the form anew.
            key={JSON.stringify([
              shop.data.merchPreorderDeadline,
              shop.data.merchOnlyEnabled,
              shop.data.pickupInformation,
            ])}
            shop={shop.data}
            editionId={edition.id}
            canWrite={canWrite}
          />
        )}
      </Section>
      <Section title={<Trans>Items of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            Merchandise is picked up at the edition: the shop promises no shipping. A ticket type
            offers the items you choose for it.
          </Trans>
        </p>
        {items.isPending ? (
          <LoadingView />
        ) : items.isError ? (
          <ErrorMessage error={items.error} />
        ) : items.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no merchandise yet.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Name</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Price</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Variants</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.data.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  to={`${base}/${item.id}`}
                  last={index === items.data.length - 1}
                  canWrite={canWrite}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}

/**
 * The pre-order deadline of the edition's merchandise, whether it takes merch-only orders, and
 * where and when merchandise is handed over.
 */
function Selling({
  shop,
  editionId,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const loaded = shop.merchPreorderDeadline ? time.toInput(shop.merchPreorderDeadline) : ''
  const [deadline, setDeadline] = useState(loaded)
  const [merchOnly, setMerchOnly] = useState(shop.merchOnlyEnabled)
  const [pickUp, setPickUp] = useState(shop.pickupInformation ?? '')
  const [invalid, setInvalid] = useState(false)
  const zone = time.timeZone
  const update = useMutation({
    ...updateEditionShopOptions(api),
    meta: { success: msg`The way merchandise sells is saved.` },
    onSuccess: (saved) =>
      queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved),
  })

  const save = () => {
    const merchPreorderDeadline = deadline ? time.fromInput(deadline) : null
    setInvalid(deadline !== '' && merchPreorderDeadline === null)
    if (deadline === '' || merchPreorderDeadline !== null) {
      update.mutate({
        params: { editionId },
        // Only what was changed here: the rest stays as someone else may have set it meanwhile.
        body: changedFrom(shop, {
          // A field left as it was filled keeps the moment it was filled from.
          merchPreorderDeadline:
            deadline === loaded ? shop.merchPreorderDeadline : merchPreorderDeadline,
          merchOnlyEnabled: merchOnly,
          pickupInformation: pickUp.trim() || null,
        }),
      })
    }
  }

  return (
    <form
      noValidate
      className="flex max-w-lg flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <FieldSet disabled={!canWrite}>
        <FormField
          label={t`Pre-order deadline`}
          hint={t`Until this moment a variant marked unlimited sells without a stock limit; after it, only a variant with a stock number sells, until that stock runs out. In the convention’s time zone, ${zone}. Leave it empty for no pre-order.`}
          error={invalid && t`Enter a date and a time, or leave it empty.`}
        >
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t`Orders of merchandise alone`}>
          {(control) => (
            <NativeSelect
              {...control}
              value={merchOnly ? 'on' : 'off'}
              onChange={(event) => setMerchOnly(event.target.value === 'on')}
            >
              <NativeSelectOption value="off">
                {t`Off: merchandise is bought with a ticket`}
              </NativeSelectOption>
              <NativeSelectOption value="on">
                {t`On: the shop also takes an order with no ticket`}
              </NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
        <FormField
          label={t`Pick-up information`}
          hint={t`Where and when merchandise is handed over. A buyer reads it on the page of their order. Up to 1000 characters.`}
        >
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={1000}
              value={pickUp}
              onChange={(event) => setPickUp(event.target.value)}
            />
          )}
        </FormField>
      </FieldSet>
      {canWrite && (
        <div>
          <Button type="submit" disabled={update.isPending}>
            <Trans>Save how merchandise sells</Trans>
          </Button>
        </div>
      )}
    </form>
  )
}

function ItemRow({
  item,
  to,
  last,
  canWrite,
}: {
  item: MerchandiseItem
  to: string
  last: boolean
  canWrite: boolean
}) {
  const { api } = useCurrentTenant()
  const money = useMoney()
  const queryClient = useQueryClient()
  const params = { editionId: item.editionId, itemId: item.id }
  const update = useMutation({
    ...updateItemOptions(api),
    meta: { success: msg({ context: 'a merchandise item', message: 'The item is saved.' }) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey(api) }),
  })
  const variants = item.variants.length
  const soldOut = item.variants.filter((variant) => variant.stock === 0).length

  return (
    <LinkRow to={to}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <RowLink to={to}>{item.name}</RowLink>
          {item.hidden && (
            <Badge variant="outline">
              <Trans context="a merchandise item">Hidden from the shop</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{money.format(item.amountMinor)}</TableCell>
      <TableCell>
        {variants === 0 ? (
          <Trans>None yet: the item cannot be bought</Trans>
        ) : (
          <Trans>
            Existing: {variants}, out of stock: {soldOut}
          </Trans>
        )}
      </TableCell>
      {canWrite && (
        <TableCell>
          <div className="flex flex-wrap gap-2">
            <ListActions
              position={item.position}
              last={last}
              hidden={item.hidden}
              pending={update.isPending}
              onMove={(position) => update.mutate({ params, body: { position } })}
              onHide={(hidden) => update.mutate({ params, body: { hidden } })}
            />
          </div>
        </TableCell>
      )}
    </LinkRow>
  )
}
