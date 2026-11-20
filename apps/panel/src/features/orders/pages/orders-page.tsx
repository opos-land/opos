import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { ORDER_STATUSES, type OrderListQuery, type OrderStatus } from '@opos/contract'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  buttonVariants,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  NoPermissionView,
  Notice,
  PageHeader,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { addOnsOptions, merchandiseOptions, ticketTypesOptions, useMoney } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { ordersOptions } from '../api/orders'
import { OrderStatusBadge } from '../components/order-status'
import { MANUAL_REASON_LABELS, STATUS_LABELS } from '../model/labels'
import { type OrderSearch, ORDERS_PAGE, pageOf, searchOf } from '../model/search'

/** What the list is narrowed to, besides the search. */
interface Filters {
  status: OrderStatus | ''
  /** What an order holds: `ticket:`, `addOn:`, `item:` or `variant:` with an identifier. */
  holds: string
  from: string
  to: string
}

const NO_FILTERS: Filters = { status: '', holds: '', from: '', to: '' }

const HOLDS = {
  ticket: 'ticketTypeId',
  addOn: 'addOnId',
  item: 'itemId',
  variant: 'variantId',
} as const

/**
 * The orders of an edition (`/editions/:editionSlug/orders`): searched by number, name, email or
 * QR code, filtered by status, by what they hold and by the day they were placed, those needing
 * review first (docs/specs/0006-order-management.md, F1 and F3). Reading needs tickets>=read in
 * the edition; recording a manual order needs tickets=write.
 */
export function OrdersPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const money = useMoney()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Orders`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const editionId = edition?.id ?? ''

  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState<OrderSearch>({})
  // A text that looks like a QR code with a mistake in it is not searched by.
  const [mistyped, setMistyped] = useState(false)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [offset, setOffset] = useState(0)
  const narrow = (changes: Partial<Filters>) => {
    setFilters((held) => ({ ...held, ...changes }))
    setOffset(0)
  }

  const [kind, id] = filters.holds.split(':') as [keyof typeof HOLDS | '', string | undefined]
  // A day is the convention's own: from its first moment to its last.
  const from = filters.from ? time.fromInput(`${filters.from}T00:00`) : null
  const until = filters.to ? time.fromInput(`${filters.to}T23:59`) : null
  const query: Partial<OrderListQuery> = {
    ...search,
    ...(filters.status && { status: filters.status }),
    ...(kind && id && { [HOLDS[kind]]: id }),
    ...(from && { from }),
    ...(until && { to: until.replace(':00.000Z', ':59.999Z') }),
    offset,
    limit: ORDERS_PAGE,
  }
  const orders = useQuery({
    ...ordersOptions(api, editionId, query),
    enabled: canRead,
    // The page before stays while the next one is read: the list does not flicker.
    placeholderData: keepPreviousData,
  })
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canRead })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canRead })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const base = `/${tenant.slug}/editions/${edition.slug}`
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = await searchOf(typed)
    setMistyped('refused' in next)
    if ('refused' in next) return
    setSearch(next)
    setOffset(0)
  }
  const page = orders.data
    ? pageOf({ offset, shown: orders.data.orders.length, total: orders.data.total })
    : null
  const needsReview = orders.data?.needsReview ?? 0

  return (
    <>
      <PageHeader
        title={<Trans>Orders</Trans>}
        description={edition.name}
        actions={
          <>
            <Link
              to={`${base}/production-numbers`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Trans>Production numbers</Trans>
            </Link>
            {atLeast(level, 'write') && (
              <Link to={`${base}/orders/new`} className={buttonVariants()}>
                <PlusIcon data-icon="inline-start" />
                <Trans>New manual order</Trans>
              </Link>
            )}
          </>
        }
      />
      {needsReview > 0 && (
        <Notice>
          <Plural
            value={needsReview}
            one="# order needs review: its payment arrived and could not confirm it. It waits for you to mark it paid or decline it."
            other="# orders need review: their payments arrived and could not confirm them. They wait for you to mark them paid or decline them."
          />{' '}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => narrow({ status: 'needs-review' })}
          >
            <Trans>Show them</Trans>
          </Button>
        </Notice>
      )}
      <Section title={<Trans>Find an order</Trans>}>
        <form onSubmit={(event) => void submit(event)} className="flex max-w-2xl items-end gap-2">
          <div className="flex-1">
            <FormField
              label={<Trans>Search</Trans>}
              hint={<Trans>An order’s number, a name, an email address or a QR code.</Trans>}
              error={
                mistyped && (
                  <Trans>
                    This looks like a QR code with a mistake in it: a QR code has 32 characters.
                    Check it and try again.
                  </Trans>
                )
              }
            >
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" className="mb-7">
            <Trans>Search</Trans>
          </Button>
        </form>
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={<Trans>Status</Trans>}>
            {(control) => (
              <NativeSelect
                {...control}
                value={filters.status}
                onChange={(event) => narrow({ status: event.target.value as Filters['status'] })}
              >
                <NativeSelectOption value="">{t`Every status`}</NativeSelectOption>
                {ORDER_STATUSES.map((status) => (
                  <NativeSelectOption key={status} value={status}>
                    {t(STATUS_LABELS[status])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={<Trans>Holds</Trans>}>
            {(control) => (
              <NativeSelect
                {...control}
                value={filters.holds}
                onChange={(event) => narrow({ holds: event.target.value })}
              >
                <NativeSelectOption value="">{t`Anything`}</NativeSelectOption>
                <NativeSelectOptGroup label={t`Ticket types`}>
                  {(ticketTypes.data ?? []).map((type) => (
                    <NativeSelectOption key={type.id} value={`ticket:${type.id}`}>
                      {type.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
                <NativeSelectOptGroup label={t`Add-ons`}>
                  {(addOns.data ?? []).map((addOn) => (
                    <NativeSelectOption key={addOn.id} value={`addOn:${addOn.id}`}>
                      {addOn.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
                {(items.data ?? []).map((item) => (
                  <NativeSelectOptGroup key={item.id} label={item.name}>
                    <NativeSelectOption value={`item:${item.id}`}>
                      {t`${item.name}: every variant`}
                    </NativeSelectOption>
                    {item.variants.length > 1 || item.axes.length > 0
                      ? item.variants.map((variant) => {
                          const label = item.axes
                            .flatMap(
                              (axis) =>
                                axis.values.find((value) => variant.valueIds.includes(value.id))
                                  ?.label ?? [],
                            )
                            .join(', ')
                          return (
                            <NativeSelectOption key={variant.id} value={`variant:${variant.id}`}>
                              {label ? `${item.name} (${label})` : item.name}
                            </NativeSelectOption>
                          )
                        })
                      : null}
                  </NativeSelectOptGroup>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={<Trans>Placed from</Trans>}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={filters.from}
                onChange={(event) => narrow({ from: event.target.value })}
              />
            )}
          </FormField>
          <FormField label={<Trans>Placed until</Trans>}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={filters.to}
                onChange={(event) => narrow({ to: event.target.value })}
              />
            )}
          </FormField>
        </div>
      </Section>
      <Section title={<Trans>Orders of the edition</Trans>}>
        {orders.isPending ? (
          <LoadingView />
        ) : orders.isError ? (
          <ErrorMessage error={orders.error} />
        ) : orders.data.orders.length === 0 ? (
          <p className="text-sm">
            <Trans>No order matches.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Number</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Status</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Name on the order</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Email</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Ticket type</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans>Total</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Placed</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono">
                    <Link to={`${base}/orders/${order.id}`} className="underline">
                      {order.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>{order.holderName || '—'}</TableCell>
                  <TableCell>
                    {order.email ??
                      (order.manualReason ? t(MANUAL_REASON_LABELS[order.manualReason]) : '—')}
                  </TableCell>
                  <TableCell>{order.ticketType ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(order.totalMinor)}
                  </TableCell>
                  <TableCell>{time.format(order.placedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {page && orders.data && orders.data.total > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <Button
              variant="outline"
              disabled={page.previous === null}
              onClick={() => setOffset(page.previous ?? 0)}
            >
              <Trans>Previous page</Trans>
            </Button>
            <Button
              variant="outline"
              disabled={page.next === null}
              onClick={() => setOffset(page.next ?? 0)}
            >
              <Trans>Next page</Trans>
            </Button>
            <p aria-live="polite">
              <Trans>
                Orders {page.first}–{page.last} of {orders.data.total}
              </Trans>
            </p>
          </div>
        )}
      </Section>
    </>
  )
}
