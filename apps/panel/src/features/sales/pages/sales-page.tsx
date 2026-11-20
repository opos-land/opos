import { Trans, useLingui } from '@lingui/react/macro'
import { type Sales } from '@opos/contract'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { useParams } from 'react-router'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
import { fileNameOf, saveFile } from '../../../shared/lib/save-file'
import {
  Button,
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { useMoney } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant } from '../../tenants'
import { type ExportedList, exportOptions, salesOptions } from '../api/sales'

/** A table of what is sold and what is pending, a row a thing sold. */
function HeldTable({
  caption,
  rows,
}: {
  caption: ReactNode
  rows: readonly { id: string; name: ReactNode; note?: ReactNode; sold: number; pending: number }[]
}) {
  const { i18n } = useLingui()
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">
            <Trans context="a thing an edition sells">Name</Trans>
          </TableHead>
          <TableHead scope="col" className="text-right">
            <Trans context="sales">Sold</Trans>
          </TableHead>
          <TableHead scope="col" className="text-right">
            <Trans context="sales">Pending</Trans>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableHead scope="row" className="font-normal">
              {row.name}
              {row.note && <span className="text-muted-foreground ml-2 text-sm">{row.note}</span>}
            </TableHead>
            <TableCell className="text-right tabular-nums">{i18n.number(row.sold)}</TableCell>
            <TableCell className="text-right tabular-nums">{i18n.number(row.pending)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** A short table of a name and one number beside it. */
function Counts({
  caption,
  rows,
}: {
  caption: ReactNode
  rows: readonly { name: ReactNode; cells: readonly ReactNode[]; key: string }[]
}) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableHead scope="row" className="font-normal">
              {row.name}
            </TableHead>
            {row.cells.map((cell, index) => (
              <TableCell key={index} className="text-right tabular-nums">
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * The sales of an edition (`/editions/:editionSlug/sales`, docs/specs/0010-sales-reports.md):
 * the dashboard, counted from the orders as they are when it is opened, and the three lists an
 * org takes away as files. Needs tickets>=read in the edition.
 */
export function SalesPage() {
  const { t, i18n } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const money = useMoney()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Sales`, edition?.name ?? tenant.name)
  const canRead = edition ? atLeast(access.edition(edition.id).tickets, 'read') : false
  const editionId = edition?.id ?? ''
  const sales = useQuery({ ...salesOptions(api, editionId), enabled: canRead })
  const [downloading, setDownloading] = useState<ExportedList | null>(null)

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const download = async (list: ExportedList) => {
    setDownloading(list)
    try {
      // Read again on every press: the file holds the orders of that moment.
      const file = await queryClient.fetchQuery({
        ...exportOptions(api, editionId, list),
        staleTime: 0,
      })
      saveFile(fileNameOf(file.headers) ?? `${list}.csv`, file.body)
    } catch (failure) {
      notifyFailure(failure)
    } finally {
      setDownloading(null)
    }
  }
  const lists: { list: ExportedList; label: ReactNode }[] = [
    { list: 'ticket-holders', label: <Trans>Ticket holders</Trans> },
    { list: 'merchandise-pick-list', label: <Trans>Merchandise pick list</Trans> },
    { list: 'payments', label: <Trans>Payments</Trans> },
  ]

  return (
    <>
      <PageHeader title={<Trans>Sales</Trans>} description={edition.name} />
      {sales.isPending ? (
        <LoadingView />
      ) : sales.isError ? (
        <ErrorMessage error={sales.error} />
      ) : (
        <Dashboard sales={sales.data} money={money.format} number={(n) => i18n.number(n)} />
      )}
      <Section title={<Trans>Lists to download</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            Each list is a file a spreadsheet opens, with the orders as they are now. The files hold
            names and email addresses: keep them as carefully as the convention’s other personal
            data.
          </Trans>
        </p>
        <div className="flex flex-wrap gap-3">
          {lists.map(({ list, label }) => (
            <Button
              key={list}
              variant="outline"
              disabled={downloading !== null}
              onClick={() => void download(list)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Section>
    </>
  )
}

function Dashboard({
  sales,
  money,
  number,
}: {
  sales: Sales
  money: (amountMinor: number) => string
  number: (value: number) => string
}) {
  const { revenue, orders, ageBands } = sales
  return (
    <>
      <Section title={<Trans>Revenue</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            What the paid orders came to. The orders an organizer recorded by hand are counted
            apart: their money did not go through the payment provider.
          </Trans>
        </p>
        <Counts
          caption={<Trans>Revenue and orders</Trans>}
          rows={[
            {
              key: 'paid',
              name: <Trans>Paid in the shop</Trans>,
              cells: [money(revenue.paidMinor), number(orders.paid)],
            },
            {
              key: 'manual',
              name: <Trans>Recorded by organizers</Trans>,
              cells: [money(revenue.manualMinor), number(orders.manual)],
            },
            {
              key: 'awaiting',
              name: <Trans context="sales">Awaiting payment</Trans>,
              cells: ['', number(orders.awaitingPayment)],
            },
            {
              key: 'review',
              name: <Trans context="sales">Needs review</Trans>,
              cells: ['', number(orders.needsReview)],
            },
          ]}
        />
      </Section>
      <Section title={<Trans>Tickets</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            “Sold” counts what paid orders hold, manual ones among them. “Pending” counts the orders
            awaiting payment and those needing review, which may still fall away. An expired,
            declined or canceled order counts nowhere.
          </Trans>
        </p>
        {sales.ticketTypes.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no ticket types.</Trans>
          </p>
        ) : (
          <HeldTable caption={<Trans>Tickets by ticket type</Trans>} rows={sales.ticketTypes} />
        )}
      </Section>
      {sales.addOns.length > 0 && (
        <Section title={<Trans>Add-ons</Trans>}>
          <HeldTable
            caption={<Trans>Add-ons taken</Trans>}
            rows={sales.addOns.map((addOn) => ({
              ...addOn,
              note: addOn.kind === 'headcount' ? <Trans>Headcount only</Trans> : undefined,
            }))}
          />
        </Section>
      )}
      {sales.items.length > 0 && (
        <Section title={<Trans>Merchandise</Trans>}>
          <HeldTable
            caption={<Trans>Merchandise by variant</Trans>}
            rows={sales.items.flatMap((item) =>
              item.variants.map((variant) => ({
                ...variant,
                name:
                  variant.labels.length > 0
                    ? `${item.name} (${variant.labels.join(', ')})`
                    : item.name,
              })),
            )}
          />
        </Section>
      )}
      <Section title={<Trans>Ticket holders by age band</Trans>}>
        <Counts
          caption={<Trans>Ticket holders of the sold tickets</Trans>}
          rows={[
            { key: 'child', name: <Trans>Child</Trans>, cells: [number(ageBands.child)] },
            { key: 'teen', name: <Trans>Teen</Trans>, cells: [number(ageBands.teen)] },
            { key: 'adult', name: <Trans>Adult</Trans>, cells: [number(ageBands.adult)] },
          ]}
        />
      </Section>
      {sales.customFields.length > 0 && (
        <Section title={<Trans>Answers to custom fields</Trans>}>
          {sales.customFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2">
              <h3 className="font-medium">{field.label}</h3>
              <Counts
                caption={field.label}
                rows={field.answers.map(({ answer, orders }) => ({
                  key: answer,
                  name: answer,
                  cells: [number(orders)],
                }))}
              />
            </div>
          ))}
        </Section>
      )}
    </>
  )
}
