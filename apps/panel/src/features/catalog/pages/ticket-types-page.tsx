import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { priceAt, type TicketType } from '@opos/contract'
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
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { catalogKey, ticketTypesOptions, updateTicketTypeOptions } from '../api/catalog'
import { ListActions } from '../components/list-actions'
import { useMoney } from '../hooks/use-money'

/**
 * The ticket types of an edition (`/editions/:editionSlug/ticket-types`), in the order the shop
 * shows them, each with the price in force now. Reading needs tickets>=read in the edition,
 * changing tickets=write.
 */
export function TicketTypesPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Ticket types`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const types = useQuery({ ...ticketTypesOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const base = `/${tenant.slug}/editions/${edition.slug}/ticket-types`
  return (
    <>
      <PageHeader
        title={<Trans>Ticket types</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link to={`${base}/new`} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              <Trans>New ticket type</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Ticket types of the edition</Trans>}>
        {types.isPending ? (
          <LoadingView />
        ) : types.isError ? (
          <ErrorMessage error={types.error} />
        ) : types.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no ticket types yet.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Name</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Price now</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Sale</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Capacity</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.data.map((type, index) => (
                <TicketTypeRow
                  key={type.id}
                  type={type}
                  to={`${base}/${type.id}`}
                  last={index === types.data.length - 1}
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

function TicketTypeRow({
  type,
  to,
  last,
  canWrite,
}: {
  type: TicketType
  to: string
  last: boolean
  canWrite: boolean
}) {
  const { i18n } = useLingui()
  const { api } = useCurrentTenant()
  const money = useMoney()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const params = { editionId: type.editionId, ticketTypeId: type.id }
  const update = useMutation({
    ...updateTicketTypeOptions(api),
    meta: { success: msg`The ticket type is saved.` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKey(api) }),
  })
  const price = priceAt(type.tiers, new Date())

  return (
    <LinkRow to={to}>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <RowLink to={to}>{type.name}</RowLink>
          {type.hidden && (
            <Badge variant="outline">
              <Trans context="a ticket type">Hidden from the shop</Trans>
            </Badge>
          )}
          {type.discountsExcluded && (
            <Badge variant="secondary">
              <Trans>Excluded from discounts</Trans>
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {price === null ? <Trans>No price in force</Trans> : money.format(price)}
      </TableCell>
      <TableCell>{time.range(type.saleStartsAt, type.saleEndsAt)}</TableCell>
      <TableCell>
        {type.capacity === null ? <Trans>No limit</Trans> : i18n.number(type.capacity)}
      </TableCell>
      {canWrite && (
        <TableCell>
          <div className="flex flex-wrap gap-2">
            <ListActions
              position={type.position}
              last={last}
              hidden={type.hidden}
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
