import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EnabledScanner } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toDataURL } from 'qrcode'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { createScannerOptions, scannersKey } from '../api/scanners'
import { pairingLink } from '../model/device'

/**
 * Enabling a scanner of an edition (`/editions/:editionSlug/scanners/new`,
 * docs/specs/0007-scanner.md, D7-D8), for an org with tickets=write in the edition. Once the
 * scanner is enabled its pairing code takes the form's place: it is shown once, until this page is
 * left.
 */
export function NewScannerPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Enable a scanner`, edition?.name ?? tenant.name)
  const [name, setName] = useState('')
  const [ends, setEnds] = useState('')
  // The scanner just enabled, with its pairing code: shown until the page is left.
  const [enabled, setEnabled] = useState<EnabledScanner | null>(null)
  const create = useMutation({
    ...createScannerOptions(api),
    meta: { success: msg`The scanner is enabled. Pair a phone with its code now.` },
    onSuccess: async (scanner) => {
      setEnabled(scanner)
      await queryClient.invalidateQueries({ queryKey: scannersKey(api) })
    },
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(access.edition(edition.id).tickets, 'write')) {
    return <NoPermissionView />
  }

  const editionId = edition.id
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const expiresAt = ends ? time.fromInput(ends) : null
    create.mutate({
      params: { editionId },
      body: { name: name.trim(), ...(expiresAt && { expiresAt }) },
    })
  }

  return (
    <>
      <PageHeader title={<Trans>Enable a scanner</Trans>} description={edition.name} />
      <p className="text-sm">
        <Link
          to={`/${tenant.slug}/editions/${edition.slug}/scanners`}
          className="text-primary underline"
        >
          <Trans>All scanners</Trans>
        </Link>
      </p>
      {enabled ? (
        <PairingCode scanner={enabled} />
      ) : (
        <Section title={<Trans>Scanner data</Trans>}>
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
