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
import { programItemsOptions } from '../api/program'
import { speakerName } from '../model/speakers'

/**
 * The edition's programme items and, for a member with `program=write`, the link to the page of a
 * new one.
 */
export function ProgramPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Programme`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).program : 'none'
  const items = useQuery({
    ...programItemsOptions(api, edition?.id ?? ''),
    enabled: atLeast(level, 'read'),
  })
  const base = `/${tenant.slug}/editions/${editionSlug ?? ''}/program`

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(level, 'read')) return <NoPermissionView />

  return (
    <>
      <PageHeader
        title={<Trans>Programme</Trans>}
        description={edition.name}
        actions={
          atLeast(level, 'write') && (
            <Link to={`${base}/new`} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              <Trans>New programme item</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>Programme items</Trans>}>
        {items.isPending ? (
          <LoadingView />
        ) : items.isError ? (
          <ErrorMessage error={items.error} />
        ) : items.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Title</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Time</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Speakers</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.data.map((item) => (
                <LinkRow key={item.id} to={`${base}/${item.id}`}>
                  <TableCell>
                    <RowLink to={`${base}/${item.id}`}>{item.title}</RowLink>
                  </TableCell>
                  <TableCell>{time.range(item.startsAt, item.endsAt)}</TableCell>
                  <TableCell>{item.speakers.map(speakerName).join(', ')}</TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">
            <Trans>There are no programme items yet.</Trans>
          </p>
        )}
      </Section>
    </>
  )
}
