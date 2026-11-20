import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AddOn } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  buttonVariants,
  ErrorMessage,
  LinkRow,
  LoadingView,
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
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { addOnsOptions, catalogKey, updateAddOnOptions } from '../api/catalog'
import { ListActions } from '../components/list-actions'
import { useMoney } from '../hooks/use-money'

/**
 * The add-ons of an edition (`/editions/:editionSlug/add-ons`): the optional extras bought with a
 * ticket, as a table in the order the shop shows them. A member who may change them moves and
 * hides a row here, opens an add-on's own page from its row, and is linked to the page of a new
 * one. Reading needs tickets>=read in the edition, changing tickets=write.
 */
export function AddOnsPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Add-ons`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const addOns = useQuery({ ...addOnsOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const base = `/${tenant.slug}/editions/${edition.slug}/add-ons`
  return (
    <>
      <PageHeader
        title={<Trans>Add-ons</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link to={`${base}/new`} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              <Trans>New add-on</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Add-ons of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            Optional extras a buyer takes with a ticket, such as a workshop or a place in the
            sleeping room. A ticket type offers the add-ons you choose for it.
          </Trans>
        </p>
        {addOns.isPending ? (
          <LoadingView />
        ) : addOns.isError ? (
          <ErrorMessage error={addOns.error} />
        ) : addOns.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no add-ons yet.</Trans>
          </p>
        ) : (
          <Table>
            <caption className="sr-only">
              <Trans>Add-ons in their order</Trans>
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans context="a thing an edition sells">Name</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Price</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="an add-on">Limit</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {addOns.data.map((addOn, index) => (
                <AddOnRow
                  key={addOn.id}
                  addOn={addOn}
                  // The page of an add-on is where it is changed: a reader has none to open.
                  to={canWrite ? `${base}/${addOn.id}` : undefined}
                  last={index === addOns.data.length - 1}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}

/** One add-on in the table: its name, its price and what limits it, and its place and hiding. */
function AddOnRow({ addOn, to, last }: { addOn: AddOn; to: string | undefined; last: boolean }) {
  const { i18n } = useLingui()
  const { api } = useCurrentTenant()
  const money = useMoney()
  const queryClient = useQueryClient()
  const params = { editionId: addOn.editionId, addOnId: addOn.id }
  const capacity = i18n.number(addOn.capacity ?? 0)
  const update = useMutation({
    ...updateAddOnOptions(api),
    meta: { success: msg`The add-on is saved.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey(api) }),
  })

  return (
    <LinkRow to={to}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {to ? <RowLink to={to}>{addOn.name}</RowLink> : <span>{addOn.name}</span>}
          {addOn.hidden && (
            <Badge variant="outline">
              <Trans context="an add-on">Hidden from the shop</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {addOn.amountMinor === 0 ? (
          <Trans context="a price">Free</Trans>
        ) : (
          money.format(addOn.amountMinor)
        )}
      </TableCell>
      <TableCell>
        {addOn.kind === 'limited' ? (
          <Trans>Limited places: {capacity}</Trans>
        ) : addOn.kind === 'headcount' ? (
          <Trans>Headcount only</Trans>
        ) : (
          <Trans>No limit</Trans>
        )}
      </TableCell>
      {to && (
        <TableCell>
          <div className="flex flex-wrap gap-2">
            <ListActions
              position={addOn.position}
              last={last}
              hidden={addOn.hidden}
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
