import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EnabledScanner, type Scanner } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toDataURL } from 'qrcode'
import { type FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
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
import {
  createScannerOptions,
  revokeScannerOptions,
  scannersKey,
  scannersOptions,
} from '../api/scanners'
import { pairingLink } from '../model/device'

/**
 * The scanners of an edition (`/editions/:editionSlug/scanners`): the phones that read QR codes
 * at the gate and at the desk (docs/specs/0007-scanner.md, D7-D11). An org with tickets write
 * access enables one, is shown its pairing code once, and revokes any of them; reading the list
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
  const [name, setName] = useState('')
  const [ends, setEnds] = useState('')
  // The scanner just enabled, with its pairing code: shown until the page is left.
  const [enabled, setEnabled] = useState<EnabledScanner | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: scannersKey(api) })
  const create = useMutation({
    ...createScannerOptions(api),
    meta: { success: msg`The scanner is enabled. Pair a phone with its code now.` },
    onSuccess: async (scanner) => {
      setEnabled(scanner)
      setName('')
      setEnds('')
      await refresh()
    },
  })
  const revoke = useMutation({
    ...revokeScannerOptions(api),
    meta: { success: msg`The scanner is revoked.` },
    onSuccess: refresh,
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const expiresAt = ends ? time.fromInput(ends) : null
    create.mutate({
      params: { editionId },
      body: { name: name.trim(), ...(expiresAt && { expiresAt }) },
    })
  }
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
      <PageHeader title={<Trans>Scanners</Trans>} description={edition.name} />
      {enabled && <PairingCode scanner={enabled} />}
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
                      {scanner.enabledBy ?? <Trans>An organizer who left the team</Trans>}
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
      {canWrite && (
        <Section title={<Trans>Enable a scanner</Trans>}>
          <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
            <FormField
              label={<Trans>Name of the scanner</Trans>}
              hint={
                <Trans>Such as the gate it stands at. Every hand-out it marks is told by it.</Trans>
              }
            >
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  maxLength={60}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </FormField>
            <FormField
              label={<Trans>Ends earlier (optional)</Trans>}
              hint={
                <Trans>
                  Left empty, the scanner’s access ends a day after the edition’s last day, and no
                  later than your own access.
                </Trans>
              }
            >
              {(control) => (
                <Input
                  {...control}
                  type="datetime-local"
                  value={ends}
                  onChange={(event) => setEnds(event.target.value)}
                />
              )}
            </FormField>
            <div>
              <Button type="submit" disabled={create.isPending || name.trim() === ''}>
                <Trans>Enable the scanner</Trans>
              </Button>
            </div>
          </form>
        </Section>
      )}
    </>
  )
}

/**
 * The pairing code of a scanner just enabled, shown once: as a QR code to read with the phone and
 * as a link. The code is after the `#` of the link, which no server sees.
 */
function PairingCode({ scanner }: { scanner: EnabledScanner }) {
  const { t } = useLingui()
  const time = useTenantTime()
  const link = pairingLink(window.location.origin, scanner.pairingCode)
  const [picture, setPicture] = useState<string>()
  useEffect(() => {
    let shown = true
    void toDataURL(link, { margin: 2, width: 320 }).then((url) => {
      if (shown) setPicture(url)
    })
    return () => {
      shown = false
    }
  }, [link])
  const { name } = scanner
  const until = time.format(scanner.pairingExpiresAt)

  return (
    <Section title={<Trans>Pair a phone with {name}</Trans>}>
      <p className="max-w-2xl text-sm">
        <Trans>
          Read this QR code with the phone’s camera, or open the link on the phone. The phone that
          opens it becomes the scanner. The code works once, until {until}, and is shown only now.
        </Trans>
      </p>
      {picture && (
        <img
          src={picture}
          alt={t`The QR code that pairs a phone with ${name}`}
          width={320}
          height={320}
          className="rounded-md border"
        />
      )}
      <p className="font-mono text-sm break-all">{link}</p>
    </Section>
  )
}
