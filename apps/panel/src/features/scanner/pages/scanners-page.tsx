import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
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
import { scannersOptions } from '../api/scanners'
import { useScannerState } from '../components/scanner-state'

/**
 * The scanners of an edition (`/editions/:editionSlug/scanners`): the phones that read QR codes
 * at the gate and at the desk (docs/specs/0007-scanner.md, D7-D15), as a table. A row opens the
 * page of its scanner, where it is paired again and revoked; an org with tickets write access is
 * linked to the page that enables one. Reading the list needs tickets>=read.
 */
export function ScannersPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const stateOf = useScannerState()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Scanners`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const scanners = useQuery({ ...scannersOptions(api, edition?.id ?? ''), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const base = `/${tenant.slug}/editions/${edition.slug}/scanners`
  return (
    <>
      <PageHeader
        title={<Trans>Scanners</Trans>}
        description={edition.name}
        actions={
          atLeast(level, 'write') && (
            <Link to={`${base}/new`} className={buttonVariants()}>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {scanners.data.map((scanner) => (
                <LinkRow key={scanner.id} to={`${base}/${scanner.id}`}>
                  <TableCell>
                    <RowLink to={`${base}/${scanner.id}`}>{scanner.name}</RowLink>
                  </TableCell>
                  {/* Judged at the moment the list was last read. */}
                  <TableCell>{stateOf(scanner, scanners.dataUpdatedAt)}</TableCell>
                  <TableCell>
                    {/* No address: an org who left the team, or one this member may not be told of. */}
                    {scanner.enabledBy ?? <Trans>Another organizer</Trans>}
                  </TableCell>
                  <TableCell>
                    {scanner.lastUsedAt ? time.format(scanner.lastUsedAt) : t`Never`}
                  </TableCell>
                  <TableCell>{time.format(scanner.expiresAt)}</TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}
