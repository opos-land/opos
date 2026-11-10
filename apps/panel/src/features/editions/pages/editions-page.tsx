import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
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
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { createEditionOptions, editionsKey } from '../api/editions'
import { EditionForm } from '../components/edition-form'
import { EditionStatus } from '../components/edition-status'
import { useEditions } from '../hooks/use-editions'

const EMPTY = { name: '', slug: '', startsAt: '', endsAt: '' }

/**
 * The edition list of the convention settings and, for a member with `settings=write`, the
 * creation form; each edition opens its own area.
 */
export function EditionsPage() {
  const { t } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  usePageTitle(t`Editions`, tenant.name)
  const time = useTenantTime()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const editions = useEditions()
  const create = useMutation({
    ...createEditionOptions(api),
    onSuccess: async (edition) => {
      await queryClient.invalidateQueries({ queryKey: editionsKey(api) })
      void navigate(`/${tenant.slug}/editions/${edition.slug}`)
    },
  })

  if (!atLeast(access.settings, 'read')) return <NoPermissionView />

  return (
    <>
      <PageHeader title={<Trans>Editions</Trans>} />
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
              {editions.data.map((edition) => (
                <TableRow key={edition.id}>
                  <TableCell>
                    <Link
                      to={`/${tenant.slug}/editions/${edition.slug}`}
                      className="text-primary font-medium underline"
                    >
                      {edition.name}
                    </Link>
                  </TableCell>
                  <TableCell>{time.range(edition.startsAt, edition.endsAt)}</TableCell>
                  <TableCell>
                    <EditionStatus edition={edition} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">
            <Trans>There are no editions yet.</Trans>
          </p>
        )}
      </Section>
      {atLeast(access.settings, 'write') && (
        <Section title={<Trans>New edition</Trans>}>
          <p className="text-muted-foreground text-sm">
            <Trans>A new edition starts inactive and unpublished.</Trans>
          </p>
          <EditionForm
            defaultValues={EMPTY}
            pending={create.isPending}
            error={create.error}
            submitLabel={<Trans>Create the edition</Trans>}
            onSubmit={(body) => create.mutate({ body })}
          />
        </Section>
      )}
    </>
  )
}
