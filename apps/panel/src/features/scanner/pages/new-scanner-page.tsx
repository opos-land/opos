import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EnabledScanner } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
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
import { PairingCode } from '../components/pairing-code'

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
                  Left empty, the scanner’s access ends a day after the edition’s last day, also
                  when that day is changed later, and no later than your own access.
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
