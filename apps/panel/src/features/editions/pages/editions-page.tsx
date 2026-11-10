import { Trans, useLingui } from '@lingui/react/macro'
import { PlusIcon } from 'lucide-react'
import { Link } from 'react-router'
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
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { EditionStatus } from '../components/edition-status'
import { useEditions } from '../hooks/use-editions'

/**
 * The edition list of the convention settings; each row opens the edition's own area, and a member
 * with `settings=write` goes on to the creation page.
 */
export function EditionsPage() {
  const { t } = useLingui()
  const { tenant, access } = useCurrentTenant()
  usePageTitle(t`Editions`, tenant.name)
  const time = useTenantTime()
  const editions = useEditions()

  if (!atLeast(access.settings, 'read')) return <NoPermissionView />

  return (
    <>
      <PageHeader
        title={<Trans>Editions</Trans>}
        actions={
          atLeast(access.settings, 'write') && (
            <Link to={`/${tenant.slug}/settings/editions/new`} className={buttonVariants()}>
              <PlusIcon data-icon="inline-start" />
              <Trans>New edition</Trans>
            </Link>
          )
        }
      />
      <Section title={<Trans>All editions</Trans>}>
        {editions.isPending ? (
          <LoadingView />
        ) : editions.isError ? (
          <ErrorMessage error={editions.error} />
        ) : editions.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Edition</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Dates</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Status</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editions.data.map((edition) => {
                const area = `/${tenant.slug}/editions/${edition.slug}`
                return (
                  <LinkRow key={edition.id} to={area}>
                    <TableCell>
                      <RowLink to={area}>{edition.name}</RowLink>
                    </TableCell>
                    <TableCell>{time.range(edition.startsAt, edition.endsAt)}</TableCell>
                    <TableCell>
                      <EditionStatus edition={edition} />
                    </TableCell>
                  </LinkRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">
            <Trans>There are no editions yet.</Trans>
          </p>
        )}
      </Section>
    </>
  )
}
