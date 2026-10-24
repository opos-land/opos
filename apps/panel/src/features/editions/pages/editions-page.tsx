import { Trans } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ErrorMessage, LoadingView, PageHeader, Section } from '../../../shared/ui'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { createEditionOptions, editionsKey } from '../api/editions'
import { EditionForm } from '../components/edition-form'
import { EditionStatus } from '../components/edition-status'
import { useEditions } from '../hooks/use-editions'

const EMPTY = { name: '', slug: '', startsAt: '', endsAt: '' }

/** The edition list and, for a member with `settings=write`, the creation form. */
export function EditionsPage() {
  const { tenant, access, api } = useCurrentTenant()
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

  return (
    <>
      <PageHeader title={<Trans>Editions</Trans>} />
      <Section title={<Trans>All editions</Trans>}>
        {editions.isPending ? (
          <LoadingView />
        ) : editions.isError ? (
          <ErrorMessage error={editions.error} />
        ) : editions.data?.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <Trans>Edition</Trans>
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <Trans>Dates</Trans>
                </th>
                <th scope="col" className="py-2 font-medium">
                  <Trans>Status</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {editions.data.map((edition) => (
                <tr key={edition.id} className="border-line border-t">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/${tenant.slug}/editions/${edition.slug}`}
                      className="text-accent font-medium underline"
                    >
                      {edition.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{time.range(edition.startsAt, edition.endsAt)}</td>
                  <td className="py-2">
                    <EditionStatus edition={edition} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">
            <Trans>There are no editions yet.</Trans>
          </p>
        )}
      </Section>
      {atLeast(access.settings, 'write') && (
        <Section title={<Trans>New edition</Trans>}>
          <p className="text-muted text-sm">
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
