import { Trans, useLingui } from '@lingui/react/macro'
import { HANDING_OVER_EMAIL_KINDS, LEFT_OUT } from '@opos/contract'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { isNotFound } from '../../../shared/lib/errors'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  ErrorMessage,
  LoadingView,
  NoPermissionView,
  NotFoundView,
  PageHeader,
  Section,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { emailOptions } from '../api/orders'
import { EmailSent } from '../components/email-sent'
import { EMAIL_KIND_LABELS } from '../model/labels'

const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </>
)

/**
 * One email of an order (`/editions/:editionSlug/emails/:emailId`,
 * docs/specs/0006-order-management.md, F4): to whom it went, of which order and when, and what
 * it said as it went out, written in the convention's language. The QR code and the order link
 * are not there to show: they are left out of what is kept, since only the recipient sees them.
 * Needs tickets>=read in the edition.
 */
export function EmailPage() {
  const { t } = useLingui()
  const { editionSlug, emailId } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const canRead = atLeast(edition ? access.edition(edition.id).tickets : 'none', 'read')
  const found = useQuery({
    ...emailOptions(api, edition?.id ?? '', emailId ?? ''),
    enabled: canRead,
  })
  usePageTitle(
    found.data ? t(EMAIL_KIND_LABELS[found.data.kind]) : t`Emails`,
    edition?.name ?? tenant.name,
  )

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />
  if (found.isPending) return <LoadingView />
  if (found.isError) {
    return isNotFound(found.error) ? <NotFoundView /> : <ErrorMessage error={found.error} />
  }

  const email = found.data
  const base = `/${tenant.slug}/editions/${edition.slug}`
  return (
    <>
      <PageHeader title={t(EMAIL_KIND_LABELS[email.kind])} description={edition.name} />
      <p className="text-sm">
        <Link to={`${base}/emails`} className="text-primary underline">
          <Trans>All emails</Trans>
        </Link>
      </p>
      <Section title={<Trans>Email</Trans>}>
        <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <Fact label={<Trans>To</Trans>}>{email.recipient ?? <Trans>The organizers</Trans>}</Fact>
          <Fact label={<Trans>Order</Trans>}>
            <Link
              to={`${base}/orders/${email.order.id}`}
              className="text-primary font-mono underline"
            >
              {email.order.number}
            </Link>
          </Fact>
          <Fact label={<Trans>Queued</Trans>}>{time.format(email.queuedAt)}</Fact>
          <Fact label={<Trans>Sent</Trans>}>
            <EmailSent email={email} />
          </Fact>
        </dl>
      </Section>
      <Section title={<Trans>What it said</Trans>}>
        {email.body === null ? (
          <p className="max-w-2xl text-sm">
            {email.sentAt ? (
              <Trans>What this email said was not kept: it went out before texts were.</Trans>
            ) : (
              <Trans>An email is written when it is sent: this one has not gone out.</Trans>
            )}
          </p>
        ) : (
          <>
            <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <Fact label={<Trans>Subject</Trans>}>{email.subject}</Fact>
            </dl>
            <p className="bg-muted/50 max-w-2xl rounded-lg border p-4 text-sm whitespace-pre-wrap">
              {email.body}
            </p>
            <div className="text-muted-foreground flex max-w-2xl flex-col gap-1 text-sm">
              <p>
                <Trans>
                  The text is shown in the convention’s language, whichever language the email went
                  out in.
                </Trans>
              </p>
              {HANDING_OVER_EMAIL_KINDS.includes(email.kind) && (
                <p>
                  <Trans>
                    The QR code and the order link are left out: only the recipient sees them.{' '}
                    {LEFT_OUT} stands where the email had them.
                  </Trans>
                </p>
              )}
            </div>
          </>
        )}
      </Section>
    </>
  )
}
