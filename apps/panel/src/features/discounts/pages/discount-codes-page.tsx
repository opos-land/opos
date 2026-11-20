import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type DiscountCode } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  Button,
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
import { addOnsOptions, merchandiseOptions, ticketTypesOptions, useMoney } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  discountCodesKey,
  discountCodesOptions,
  updateDiscountCodeOptions,
} from '../api/discount-codes'
import { type CodeCatalog } from '../components/discount-code-form'
import { shownCode, type Standing, standingOf } from '../model/discount-code-form'

/**
 * The discount codes of an edition (`/editions/:editionSlug/discount-codes`,
 * docs/specs/0008-discount-codes.md, D4-D6): the codes as a table by their text, each with its
 * value, the uses orders hold against its limit, its window, what it applies to and whether it can
 * be used now. A member who may change them ends a code here or lets it run again, opens a code's
 * own page from its row, and is linked to the page of a new one. Reading needs tickets>=read in
 * the edition, changing tickets=write.
 */
export function DiscountCodesPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Discount codes`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const editionId = edition?.id ?? ''
  const codes = useQuery({ ...discountCodesOptions(api, editionId), enabled: canRead })
  // What a code applies to is named from the edition's catalog, which the same permission reads.
  const ticketTypes = useQuery({ ...ticketTypesOptions(api, editionId), enabled: canRead })
  const addOns = useQuery({ ...addOnsOptions(api, editionId), enabled: canRead })
  const items = useQuery({ ...merchandiseOptions(api, editionId), enabled: canRead })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  const catalog: CodeCatalog = {
    ticketTypes: ticketTypes.data ?? [],
    addOns: addOns.data ?? [],
    items: items.data ?? [],
  }
  const reading = codes.isPending || ticketTypes.isPending || addOns.isPending || items.isPending
  const failure = codes.error ?? ticketTypes.error ?? addOns.error ?? items.error
  return (
    <>
      <PageHeader
        title={<Trans>Discount codes</Trans>}
        description={edition.name}
        actions={
          canWrite && (
            <Link
              to={`/${tenant.slug}/editions/${edition.slug}/discount-codes/new`}
              className={buttonVariants()}
            >
              <PlusIcon data-icon="inline-start" />
              <Trans>New discount code</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Discount codes of the edition</Trans>}>
        <p className="max-w-2xl text-sm">
          <Trans>
            A buyer enters a code at the Summary of the checkout, and it lowers the price of what
            you chose for it. A code of 100% gives free entry: give one to a guest, who then checks
            out like any buyer and gets a QR code.
          </Trans>
        </p>
        {reading ? (
          <LoadingView />
        ) : failure ? (
          <ErrorMessage error={failure} />
        ) : codes.data?.length === 0 ? (
          <p className="text-sm">
            <Trans>The edition has no discount codes yet.</Trans>
          </p>
        ) : (
          <Table>
            <caption className="sr-only">
              <Trans>Discount codes by their text</Trans>
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans context="a discount code">Code</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a discount code">Value</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a discount code">Uses</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a discount code">Valid</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans context="a discount code">Applies to</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>State</Trans>
                </TableHead>
                {canWrite && (
                  <TableHead scope="col">
                    <Trans>Actions</Trans>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.data?.map((code) => (
                <DiscountCodeRow
                  key={code.id}
                  editionId={edition.id}
                  code={code}
                  catalog={catalog}
                  // The page of a code is where it is changed: a reader has none to open.
                  to={
                    canWrite
                      ? `/${tenant.slug}/editions/${edition.slug}/discount-codes/${code.id}`
                      : undefined
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  )
}

/**
 * One discount code in the table (D4-D6). Ending a code is undone by the same button and asks
 * nothing; its fields and its deletion are on its own page.
 */
function DiscountCodeRow({
  editionId,
  code,
  catalog,
  to,
}: {
  editionId: string
  code: DiscountCode
  catalog: CodeCatalog
  to: string | undefined
}) {
  const { t, i18n } = useLingui()
  const { api } = useCurrentTenant()
  const money = useMoney()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const params = { editionId, codeId: code.id }
  const name = shownCode(code.code)
  const uses = i18n.number(code.uses)
  const limit = i18n.number(code.usageLimit ?? 0)
  const standings: Record<Standing, string> = {
    active: t({ message: 'Active', context: 'a discount code' }),
    ended: t({ message: 'Ended', context: 'a discount code' }),
    expired: t({ message: 'Expired', context: 'a discount code' }),
    'not-yet': t({ message: 'Not valid yet', context: 'a discount code' }),
    'used-up': t({ message: 'Used up', context: 'a discount code' }),
  }
  const standing = standingOf(code, new Date())
  const applies = [
    ...catalog.ticketTypes.filter((type) => code.ticketTypeIds.includes(type.id)),
    ...catalog.addOns.filter((addOn) => code.addOnIds.includes(addOn.id)),
    ...catalog.items.filter((item) => code.itemIds.includes(item.id)),
  ]
    .map((sold) => sold.name)
    .join(', ')

  const refresh = () => queryClient.invalidateQueries({ queryKey: discountCodesKey(api) })
  const end = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” is ended.` },
    onSuccess: refresh,
  })
  const resume = useMutation({
    ...updateDiscountCodeOptions(api),
    meta: { success: msg`The code “${name}” can be used again.` },
    onSuccess: refresh,
  })

  return (
    <LinkRow to={to}>
      <TableCell className="font-mono">
        {to ? <RowLink to={to}>{name}</RowLink> : <span>{name}</span>}
      </TableCell>
      <TableCell>
        {code.kind === 'percent'
          ? i18n.number((code.percent ?? 0) / 100, { style: 'percent' })
          : money.format(code.amountMinor ?? 0)}
      </TableCell>
      <TableCell>
        {code.usageLimit === null ? (
          <Trans context="the uses of a discount code">{uses}, no limit</Trans>
        ) : (
          <Trans context="the uses of a discount code">
            {uses} of {limit}
          </Trans>
        )}
      </TableCell>
      <TableCell>{time.range(code.validFrom, code.validUntil)}</TableCell>
      <TableCell>{applies}</TableCell>
      <TableCell>
        <Badge variant={standing === 'active' ? 'secondary' : 'outline'}>
          {standings[standing]}
        </Badge>
      </TableCell>
      {to && (
        <TableCell>
          {code.ended ? (
            <Button
              variant="outline"
              disabled={resume.isPending}
              onClick={() => resume.mutate({ params, body: { ended: false } })}
            >
              <Trans>Let it run again</Trans>
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={end.isPending}
              onClick={() => end.mutate({ params, body: { ended: true } })}
            >
              <Trans>End the code</Trans>
            </Button>
          )}
        </TableCell>
      )}
    </LinkRow>
  )
}
