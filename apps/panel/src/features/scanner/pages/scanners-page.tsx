import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type Scanner } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  buttonVariants,
  ErrorMessage,
  IrreversibleAction,
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
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { revokeScannerOptions, scannersKey, scannersOptions } from '../api/scanners'

/**
 * The scanners of an edition (`/editions/:editionSlug/scanners`): the phones that read QR codes
 * at the gate and at the desk (docs/specs/0007-scanner.md, D7-D11). An org with tickets write
 * access is linked to the page that enables one, and revokes any of them here; reading the list
 * needs tickets>=read.
 */
export function ScannersPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Scanners`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const editionId = edition?.id ?? ''
  const scanners = useQuery({ ...scannersOptions(api, editionId), enabled: canRead })
  const refresh = () => queryClient.invalidateQueries({ queryKey: scannersKey(api) })
  const revoke = useMutation({
    ...revokeScannerOptions(api),
    meta: { success: msg`The scanner is revoked.` },
    onSuccess: refresh,
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  // Judged at the moment the list was last read.
  const stateOf = (scanner: Scanner) =>
    scanner.revokedAt
      ? t`Revoked`
      : Date.parse(scanner.expiresAt) <= scanners.dataUpdatedAt
        ? t`Ended`
        : scanner.paired
          ? t`Paired with a phone`
          : t`Waiting for a phone`

  return (
    <>
      <PageHeader
        title={<Trans>Scanners</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link
              to={`/${tenant.slug}/editions/${edition.slug}/scanners/new`}
              className={buttonVariants()}
            >
              <PlusIcon data-icon="inline-start" />
              <Trans>Enable a scanner</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Scanners of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            A scanner is a phone that reads buyers’ QR codes at the gate and at the desk, with no
            account signed in. It reads the orders of this edition alone.
          </Trans>
        </p>
        {scanners.isPending ? (
          <LoadingView />
        ) : scanners.isError ? (
          <ErrorMessage error={scanners.error} />
        ) : scanners.data.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no scanners yet.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Scanner</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>State</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Enabled by</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Last used</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Access ends</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {scanners.data.map((scanner) => {
                const scannerName = scanner.name
                return (
                  <TableRow key={scanner.id}>
                    <TableCell className="font-medium">{scanner.name}</TableCell>
                    <TableCell>{stateOf(scanner)}</TableCell>
                    <TableCell>
                      {/* No address: an org who left the team, or one this member may not be told of. */}
                      {scanner.enabledBy ?? <Trans>Another organizer</Trans>}
                    </TableCell>
                    <TableCell>
                      {scanner.lastUsedAt ? time.format(scanner.lastUsedAt) : t`Never`}
                    </TableCell>
                    <TableCell>{time.format(scanner.expiresAt)}</TableCell>
                    {canWrite && (
                      <TableCell>
                        {!scanner.revokedAt && (
                          <IrreversibleAction
                            label={
                              <span aria-label={t`Revoke ${scannerName}`}>
                                <Trans>Revoke</Trans>
                              </span>
                            }
                            title={<Trans>Revoke the scanner {scannerName}?</Trans>}
                            action={<Trans>Revoke the scanner</Trans>}
                            disabled={revoke.isPending}
                            onConfirm={() =>
                              revoke.mutateAsync({ params: { editionId, scannerId: scanner.id } })
                            }
                          >
                            <Trans>
                              The phone reads and marks nothing from then on, and no screen brings
                              its access back: a phone is paired again as a new scanner.
                            </Trans>
                          </IrreversibleAction>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}
