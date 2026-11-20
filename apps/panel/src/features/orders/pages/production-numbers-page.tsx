import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
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
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { productionNumbersExportOptions, productionNumbersOptions } from '../api/orders'
import { fileNameOf, saveFile } from '../model/save-file'

/**
 * The production numbers of an edition's merchandise
 * (`/editions/:editionSlug/production-numbers`): the count of every variant, to send to the
 * manufacturer once the pre-order deadline has passed, as a file too
 * (docs/specs/0006-order-management.md, S2 and S3). Needs tickets>=read in the edition.
 */
export function ProductionNumbersPage() {
  const { t, i18n } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Production numbers`, edition?.name ?? tenant.name)
  const canRead = edition ? atLeast(access.edition(edition.id).tickets, 'read') : false
  const editionId = edition?.id ?? ''
  const numbers = useQuery({
    ...productionNumbersOptions(api, editionId),
    enabled: canRead,
    // A refusal is an answer: the deadline has not passed.
    retry: false,
  })
  const [downloading, setDownloading] = useState(false)

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const download = async () => {
    setDownloading(true)
    try {
      // Read again on every press: the file holds the numbers of that moment.
      const file = await queryClient.fetchQuery({
        ...productionNumbersExportOptions(api, editionId),
        staleTime: 0,
      })
      saveFile(fileNameOf(file.headers) ?? 'production-numbers.csv', file.body)
    } catch (failure) {
      notifyFailure(failure)
    } finally {
      setDownloading(false)
    }
  }
  const deadline = numbers.data?.deadline

  return (
    <>
      <PageHeader
        title={<Trans>Production numbers</Trans>}
        description={edition.name}
        actions={
          numbers.isSuccess && (
            <Button variant="outline" disabled={downloading} onClick={() => void download()}>
              <Trans>Download as a file</Trans>
            </Button>
          )
        }
      />
      <Section title={<Trans>Merchandise to produce</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            How many of each variant the orders hold. “Paid” counts the paid orders, manual ones
            among them; the orders awaiting payment and those needing review are counted apart,
            since they may still fall away.
          </Trans>
        </p>
        {deadline && (
          <p className="text-sm">
            <Trans>The pre-order deadline passed on {time.format(deadline)}.</Trans>
          </p>
        )}
        {numbers.isPending ? (
          <LoadingView />
        ) : numbers.isError ? (
          <ErrorMessage error={numbers.error} />
        ) : numbers.data.items.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no merchandise.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Merchandise item</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Variant</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans context="production numbers">Paid</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans context="production numbers">Awaiting payment</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans context="production numbers">Needs review</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.data.items.flatMap((item) =>
                item.variants.map((variant) => (
                  <TableRow key={variant.variantId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{variant.labels.join(', ') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i18n.number(variant.paid)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i18n.number(variant.awaitingPayment)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i18n.number(variant.needsReview)}
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}
