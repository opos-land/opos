import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EnabledScanner, type ScannerDetail } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  IrreversibleAction,
  LinkRow,
  LoadingView,
  NoPermissionView,
  NotFoundView,
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
import {
  renewPairingOptions,
  revokeScannerOptions,
  scannerOptions,
  scannersKey,
} from '../api/scanners'
import { PairingCode } from '../components/pairing-code'
import { stands, useScannerState } from '../components/scanner-state'

/** A short table of a name and one value beside it. */
function Facts({
  caption,
  rows,
}: {
  caption: ReactNode
  rows: readonly { key: string; name: ReactNode; value: ReactNode }[]
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
            <TableCell className="text-right tabular-nums">{row.value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * One scanner of an edition (`/editions/:editionSlug/scanners/:scannerId`,
 * docs/specs/0007-scanner.md, D14-D15): what the list tells of it and what it handed out, with the
 * orders it marked last, for an org with tickets>=read; and for one with tickets=write a new
 * pairing code, shown once, and revoking. A code already spent is never shown again: a phone is
 * paired again with a new one, which takes the scanner from the phone that held it.
 */
export function EditionScannerPage() {
  const { t } = useLingui()
  const { editionSlug, scannerId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const found = useQuery({
    ...scannerOptions(api, edition?.id ?? '', scannerId ?? ''),
    enabled: canRead,
  })
  usePageTitle(found.data?.name ?? t`Scanners`, edition?.name ?? tenant.name)

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />
  if (found.isPending) return <LoadingView />
  if (found.isError) {
    return isNotFound(found.error) ? <NotFoundView /> : <ErrorMessage error={found.error} />
  }

  const base = `/${tenant.slug}/editions/${edition.slug}`
  return (
    <>
      <PageHeader title={found.data.name} description={edition.name} />
      <p className="text-sm">
        <Link to={`${base}/scanners`} className="text-primary underline">
          <Trans>All scanners</Trans>
        </Link>
      </p>
      <About scanner={found.data} at={found.dataUpdatedAt} />
      <HandOuts handOuts={found.data.handOuts} orders={`${base}/orders`} />
      {atLeast(level, 'write') && (
        <Changes editionId={edition.id} scanner={found.data} at={found.dataUpdatedAt} />
      )}
    </>
  )
}

/** What the list tells of the scanner. */
function About({ scanner, at }: { scanner: ScannerDetail; at: number }) {
  const { t } = useLingui()
  const time = useTenantTime()
  const stateOf = useScannerState()
  const ends = time.format(scanner.expiresAt)
  return (
    <Section title={<Trans>Scanner</Trans>}>
      {/* Why a scanner that is neither revoked nor ended reads nothing, for a reader too. */}
      {stands(scanner, at) && scanner.orgStanding === 'stopped' && (
        <p role="note" className="max-w-2xl text-sm">
          <Trans>
            This scanner reads and marks nothing for now: the organizer who enabled it cannot manage
            the tickets of this edition at the moment, because their access has ended or their
            tickets permission was lowered. The scanner works again, on the phone that holds it, as
            soon as that organizer can.
          </Trans>
        </p>
      )}
      {stands(scanner, at) && scanner.orgStanding === 'left' && (
        <p role="note" className="max-w-2xl text-sm">
          <Trans>
            This scanner reads and marks nothing, for good: the organizer who enabled it left the
            team. Revoke it and enable a new scanner.
          </Trans>
        </p>
      )}
      <Facts
        caption={<Trans>The scanner</Trans>}
        rows={[
          // Judged at the moment the scanner was last read.
          { key: 'state', name: <Trans>State</Trans>, value: stateOf(scanner, at) },
          {
            key: 'by',
            name: <Trans>Enabled by</Trans>,
            // No address: an org who left the team, or one this member may not be told of.
            value: scanner.enabledBy ?? <Trans>Another organizer</Trans>,
          },
          {
            key: 'used',
            name: <Trans>Last used</Trans>,
            value: scanner.lastUsedAt ? time.format(scanner.lastUsedAt) : t`Never`,
          },
          {
            key: 'ends',
            name: <Trans>Access ends</Trans>,
            // With no end of its own the scanner follows its edition: the date moves when the
            // edition's last day does.
            value: scanner.followsEdition ? t`${ends}, a day after the edition’s last day` : ends,
          },
        ]}
      />
    </Section>
  )
}

/** What the scanner handed out: how much and when, and the orders it marked last. */
function HandOuts({ handOuts, orders }: { handOuts: ScannerDetail['handOuts']; orders: string }) {
  const { i18n } = useLingui()
  const time = useTenantTime()
  return (
    <Section title={<Trans>Hand-outs</Trans>}>
      <p className="max-w-2xl text-sm">
        <Trans>
          What this scanner marked as handed out: entry and items. A scan that hands nothing out is
          not counted, and neither is a mark taken back in the panel.
        </Trans>
      </p>
      {handOuts.orders === 0 ? (
        <p className="text-sm">
          <Trans>The scanner handed nothing out yet.</Trans>
        </p>
      ) : (
        <>
          <Facts
            caption={<Trans>What the scanner handed out</Trans>}
            rows={[
              { key: 'orders', name: <Trans>Orders</Trans>, value: i18n.number(handOuts.orders) },
              {
                key: 'lines',
                name: <Trans>Entries and items</Trans>,
                value: i18n.number(handOuts.lines),
              },
              {
                key: 'first',
                name: <Trans>First hand-out</Trans>,
                value: handOuts.firstAt ? time.format(handOuts.firstAt) : '',
              },
              {
                key: 'last',
                name: <Trans>Last hand-out</Trans>,
                value: handOuts.lastAt ? time.format(handOuts.lastAt) : '',
              },
            ]}
          />
          <Table>
            <caption className="sr-only">
              <Trans>Orders the scanner handed out last</Trans>
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Order</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Ticket holder</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans>Entries and items</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Last hand-out</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {handOuts.latest.map((order) => (
                <LinkRow key={order.orderId} to={`${orders}/${order.orderId}`}>
                  <TableCell className="font-mono">
                    <RowLink to={`${orders}/${order.orderId}`}>{order.number}</RowLink>
                  </TableCell>
                  <TableCell>{order.holderName || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i18n.number(order.lines)}
                  </TableCell>
                  <TableCell>{time.format(order.lastAt)}</TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Section>
  )
}

/** What an org with tickets write access does with the scanner: pair a phone again, revoke it. */
function Changes({
  editionId,
  scanner,
  at,
}: {
  editionId: string
  scanner: ScannerDetail
  at: number
}) {
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  // The new pairing code, shown until the page is left.
  const [paired, setPaired] = useState<EnabledScanner | null>(null)
  const params = { editionId, scannerId: scanner.id }
  const name = scanner.name
  const refresh = () => queryClient.invalidateQueries({ queryKey: scannersKey(api) })
  const renew = useMutation({
    ...renewPairingOptions(api),
    meta: { success: msg`The scanner has a new pairing code. Pair a phone with it now.` },
    onSuccess: async (enabled) => {
      setPaired(enabled)
      await refresh()
    },
  })
  const revoke = useMutation({
    ...revokeScannerOptions(api),
    meta: { success: msg`The scanner is revoked.` },
    onSuccess: async () => {
      setPaired(null)
      await refresh()
    },
  })

  if (!stands(scanner, at)) {
    return (
      <Section title={<Trans>Pair a phone</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            This scanner was revoked or its access has ended: it gets no new pairing code. Enable a
            new scanner instead.
          </Trans>
        </p>
      </Section>
    )
  }

  return (
    <>
      {paired && <PairingCode scanner={paired} />}
      <Section title={<Trans>Pair a phone</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            A pairing code works once and is shown once, so the code this scanner was enabled with
            cannot be shown again. To use the scanner on a phone again, or on another one, give it a
            new code.
          </Trans>
        </p>
        <div>
          {scanner.orgStanding !== 'writes' ? (
            // A code would pair no phone while the organizer behind the scanner stops it.
            <p className="max-w-2xl text-sm">
              <Trans>A stopped scanner gets no new pairing code.</Trans>
            </p>
          ) : scanner.paired ? (
            <IrreversibleAction
              label={<Trans>New pairing code</Trans>}
              title={<Trans>Pair another phone with {name}?</Trans>}
              action={<Trans>Pair another phone</Trans>}
              disabled={renew.isPending}
              onConfirm={() => renew.mutateAsync({ params })}
            >
              <Trans>
                The phone that holds the scanner now reads and marks nothing from then on. It gets
                the scanner back only by opening a new pairing code.
              </Trans>
            </IrreversibleAction>
          ) : (
            <Button disabled={renew.isPending} onClick={() => renew.mutate({ params })}>
              <Trans>New pairing code</Trans>
            </Button>
          )}
        </div>
      </Section>
      <Section title={<Trans>Revoke the scanner</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>Revoke a scanner whose phone is lost or no longer needed.</Trans>
        </p>
        <div>
          <IrreversibleAction
            label={<Trans>Revoke the scanner</Trans>}
            title={<Trans>Revoke the scanner {name}?</Trans>}
            action={<Trans>Revoke the scanner</Trans>}
            disabled={revoke.isPending}
            onConfirm={() => revoke.mutateAsync({ params })}
          >
            <Trans>
              The phone reads and marks nothing from then on, and no screen brings its access back:
              a phone is paired again as a new scanner.
            </Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </>
  )
}
