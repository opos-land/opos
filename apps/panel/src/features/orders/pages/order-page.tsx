import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
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
import { useMoney } from '../../catalog'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import { orderOptions } from '../api/orders'
import {
  CancelForm,
  EmailForm,
  HolderForm,
  ResendButton,
  ReviewPanel,
} from '../components/order-changes'
import { OrderLines } from '../components/order-lines'
import { OrderStatusBadge } from '../components/order-status'
import {
  AGE_BAND_LABELS,
  ATTEMPT_STATUS_LABELS,
  EMAIL_KIND_LABELS,
  FAILURE_LABELS,
  INFORMATION_AMOUNTS,
  INFORMATION_LABELS,
  MANUAL_REASON_LABELS,
  MONEY_WITH_LABELS,
  STATUS_HEADING,
} from '../model/labels'

const Fact = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </>
)

/**
 * The page of an order (`/editions/:editionSlug/orders/:orderId`): everything the order keeps,
 * and what an org does with it (docs/specs/0006-order-management.md, F2): the corrections, the
 * hand-out marks, resending, the cancellation, and, for an order in review, marking it paid or
 * declining it. Reading needs tickets>=read in the edition, every change tickets=write.
 */
export function OrderPage() {
  const { t } = useLingui()
  const { editionSlug, orderId = '' } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const money = useMoney()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const canRead = atLeast(level, 'read')
  const found = useQuery({ ...orderOptions(api, edition?.id ?? '', orderId), enabled: canRead })
  const number = found.data?.number
  usePageTitle(number ? t`Order ${number}` : t`Order`, edition?.name ?? tenant.name)

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />
  if (found.isPending) return <LoadingView />
  if (found.isError) return <ErrorMessage error={found.error} />

  const order = found.data
  const canWrite = atLeast(level, 'write')
  const paid = order.status === 'paid' || order.status === 'paid-manual'
  const editionId = edition.id
  const base = `/${tenant.slug}/editions/${edition.slug}`

  return (
    <>
      <PageHeader
        title={<Trans>Order {order.number}</Trans>}
        description={
          <Link to={`${base}/orders`} className="underline">
            <Trans>Orders of {edition.name}</Trans>
          </Link>
        }
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            {canWrite && order.status === 'paid' && order.email && (
              <ResendButton editionId={editionId} order={order} />
            )}
          </>
        }
      />
      {order.status === 'needs-review' && (
        <ReviewPanel editionId={editionId} order={order} canWrite={canWrite} />
      )}
      <Section title={<Trans>The order</Trans>}>
        <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <Fact label={<Trans>Placed</Trans>}>{time.format(order.placedAt)}</Fact>
          {order.paidAt && <Fact label={<Trans>Paid</Trans>}>{time.format(order.paidAt)}</Fact>}
          {order.manualReason && (
            <Fact label={<Trans>Recorded as</Trans>}>
              {t(MANUAL_REASON_LABELS[order.manualReason])}
            </Fact>
          )}
          {order.note && <Fact label={<Trans>Note</Trans>}>{order.note}</Fact>}
          <Fact label={<Trans>Email</Trans>}>{order.email ?? '—'}</Fact>
          <Fact label={<Trans>Ticket holder</Trans>}>{order.holderName || '—'}</Fact>
          {order.ageBand && (
            <Fact label={<Trans>Age band</Trans>}>{t(AGE_BAND_LABELS[order.ageBand])}</Fact>
          )}
          {order.guardianConsentAcknowledgedAt && (
            <Fact label={<Trans>Guardian’s consent</Trans>}>
              <Trans>Brought on paper to the convention</Trans>
            </Fact>
          )}
          {order.answers.map((answer) => (
            <Fact key={answer.fieldId} label={answer.label}>
              {answer.answer}
            </Fact>
          ))}
          <Fact label={<Trans>QR code</Trans>}>
            {order.hasQrCode ? <Trans>The order carries one</Trans> : <Trans>None</Trans>}
          </Fact>
          {order.canceledAt && (
            <Fact label={<Trans>Canceled</Trans>}>
              {time.format(order.canceledAt)}
              {order.cancelReason && ` · ${order.cancelReason}`}
            </Fact>
          )}
          {order.declinedAt && (
            <Fact label={<Trans>Declined</Trans>}>
              {time.format(order.declinedAt)}
              {order.declineReason && ` · ${order.declineReason}`}
            </Fact>
          )}
        </dl>
      </Section>
      <Section title={<Trans>What the order holds</Trans>}>
        <OrderLines editionId={editionId} order={order} canChange={canWrite && paid} />
      </Section>
      {canWrite && paid && (
        <HolderForm key={order.holderName} editionId={editionId} order={order} />
      )}
      {canWrite && order.status === 'paid' && order.email && (
        <EmailForm editionId={editionId} order={order} />
      )}
      {order.consents.length > 0 && (
        <Section title={<Trans>Consents accepted</Trans>}>
          <ul className="flex flex-col gap-2 text-sm">
            {order.consents.map((consent) => {
              const title = consent.document?.title
              const version = consent.document?.number
              return (
                <li key={consent.consentId}>
                  {consent.text}
                  <span className="text-muted-foreground">
                    {' · '}
                    {time.format(consent.acceptedAt)}
                    {consent.document && (
                      <>
                        {' · '}
                        <Trans>
                          {title}, version {version}
                        </Trans>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
      <Section title={<Trans>Payment attempts</Trans>}>
        {order.attempts.length === 0 ? (
          <p className="text-sm">
            <Trans>The order has no payment attempt.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Started</Trans>
                </TableHead>
                <TableHead scope="col">{t(STATUS_HEADING)}</TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans>To pay</Trans>
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <Trans>Paid</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Where the money is</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>From the payment provider</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.attempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell>{time.format(attempt.startedAt)}</TableCell>
                  <TableCell>{t(ATTEMPT_STATUS_LABELS[attempt.status])}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money.format(attempt.amountMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {attempt.paidAmountMinor === null ? '—' : money.format(attempt.paidAmountMinor)}
                  </TableCell>
                  <TableCell>
                    {attempt.moneyWith ? t(MONEY_WITH_LABELS[attempt.moneyWith]) : '—'}
                  </TableCell>
                  <TableCell>
                    <ul>
                      {Object.entries(attempt.information).map(([name, value]) => (
                        <li key={name}>
                          {INFORMATION_LABELS[name] ? t(INFORMATION_LABELS[name]) : name}:{' '}
                          {INFORMATION_AMOUNTS.includes(name) ? (
                            money.format(Number(value))
                          ) : (
                            <span className="font-mono">{value}</span>
                          )}
                        </li>
                      ))}
                      {attempt.failureReason && <li>{t(FAILURE_LABELS[attempt.failureReason])}</li>}
                      {attempt.failureCode && (
                        // The provider's own code and words, as it sent them: for its support.
                        <li className="text-muted-foreground">
                          <Trans>From the provider:</Trans>{' '}
                          <span className="font-mono">
                            {attempt.failureCode}
                            {attempt.failureMessage && `: ${attempt.failureMessage}`}
                          </span>
                        </li>
                      )}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      <Section title={<Trans>Emails</Trans>}>
        {order.emails.length === 0 ? (
          <p className="text-sm">
            <Trans>The order sent no email.</Trans>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">
                  <Trans>Email</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>To</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Sent</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.emails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell>{t(EMAIL_KIND_LABELS[email.kind])}</TableCell>
                  <TableCell>{email.recipient ?? <Trans>The organizers</Trans>}</TableCell>
                  <TableCell>
                    {email.withdrawnAt ? (
                      <Trans>Not sent: the order moved to another address before it went out</Trans>
                    ) : email.sentAt ? (
                      time.format(email.sentAt)
                    ) : email.failedAttempts > 0 ? (
                      <Trans>Not sent yet: it is tried again</Trans>
                    ) : (
                      <Trans>Waiting to be sent</Trans>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {canWrite && paid && <CancelForm editionId={editionId} order={order} />}
    </>
  )
}
