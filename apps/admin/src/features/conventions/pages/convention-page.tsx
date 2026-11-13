import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { errorCode } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  buttonVariants,
  ErrorMessage,
  LoadingView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { conventionOptions } from '../api/conventions'
import { ConventionAddress } from '../components/convention-address'
import { ConventionSuspension } from '../components/convention-suspension'
import { DeleteConvention } from '../components/delete-convention'

/** A head organizer as the page names them: the name when the account has one, and the address. */
const fullName = (head: { firstName: string | null; lastName: string | null }) =>
  [head.firstName, head.lastName].filter(Boolean).join(' ')

/**
 * `/conventions/:conventionId`: a convention with its head organizers, whom the admin tells
 * themselves when it is suspended or deleted; the change of its address; its suspension; and,
 * only while it is suspended, its deletion. Nothing of its team, editions or programme.
 */
export function ConventionPage() {
  const { t } = useLingui()
  const { conventionId = '' } = useParams()
  const convention = useQuery(conventionOptions(conventionId))
  usePageTitle(convention.data?.name ?? t`Convention`)

  if (convention.isPending) return <LoadingView />
  if (convention.isError) {
    const code = errorCode(convention.error)
    // An identifier that names no convention, or is no identifier at all.
    if (code === 'request.not-found' || code === 'request.invalid') return <NotFoundView />
    return (
      <section className="p-8">
        <ErrorMessage error={convention.error} />
      </section>
    )
  }
  const { data } = convention

  return (
    <main className="py-6">
      <PageHeader
        title={data.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <code>{data.slug}</code>
            {data.suspendedAt && (
              <Badge variant="destructive">
                <Trans comment="The state of a convention the admin suspended">Suspended</Trans>
              </Badge>
            )}
          </span>
        }
        actions={
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeftIcon data-icon="inline-start" />
            <Trans>Back to the conventions</Trans>
          </Link>
        }
      />
      <Section title={<Trans>Head organizers</Trans>}>
        <p className="text-muted-foreground text-sm">
          <Trans>
            No email goes to them when the convention is suspended, restored or deleted: tell them
            yourself.
          </Trans>
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {data.heads.map((head) => (
            <li key={head.accountId}>
              {fullName(head) && <span className="font-medium">{fullName(head)} · </span>}
              {head.email}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={<Trans>Address</Trans>}>
        <ConventionAddress convention={data} />
      </Section>
      <Section title={<Trans>Suspension</Trans>}>
        <ConventionSuspension convention={data} />
      </Section>
      {data.suspendedAt && (
        <Section title={<Trans>Deletion</Trans>}>
          <p className="text-sm">
            <Trans>
              Only a suspended convention can be deleted. The deletion is immediate and permanent.
            </Trans>
          </p>
          <div>
            <DeleteConvention convention={data} />
          </div>
        </Section>
      )}
    </main>
  )
}
