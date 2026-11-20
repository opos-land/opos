import { Trans, useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  FormField,
  Input,
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
import { atLeast, useCurrentTenant } from '../../tenants'
import { emailsOptions } from '../api/orders'
import { EmailSent } from '../components/email-sent'
import { EMAIL_KIND_LABELS } from '../model/labels'
import { ORDERS_PAGE, pageOf } from '../model/search'

/**
 * The emails of an edition's orders (`/editions/:editionSlug/emails`): every email the orders
 * sent or are about to send, the newest first, searched by the address one went to or by its
 * order's number (docs/specs/0006-order-management.md, F4). A row opens the email's page, where
 * what it said is read. Needs tickets>=read in the edition.
 */
export function EmailsPage() {
  const { t, i18n } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Emails`, edition?.name ?? tenant.name)
  const canRead = atLeast(edition ? access.edition(edition.id).tickets : 'none', 'read')

  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const emails = useQuery({
    ...emailsOptions(api, edition?.id ?? '', {
      ...(search && { q: search }),
      offset,
      limit: ORDERS_PAGE,
    }),
    enabled: canRead,
    // The page before stays while the next one is read: the list does not flicker.
    placeholderData: keepPreviousData,
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !canRead) return <NoPermissionView />

  const base = `/${tenant.slug}/editions/${edition.slug}/emails`
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSearch(typed.trim())
    setOffset(0)
  }
  const page = emails.data
    ? pageOf({ offset, shown: emails.data.emails.length, total: emails.data.total })
    : null

  return (
    <>
      <PageHeader title={<Trans>Emails</Trans>} description={edition.name} />
      <Section title={<Trans>Find an email</Trans>}>
        <form onSubmit={submit} className="flex max-w-2xl items-end gap-2">
          <div className="flex-1">
            <FormField
              label={<Trans>Search</Trans>}
              hint={<Trans>An email address or an order’s number.</Trans>}
            >
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </FormField>
          </div>
          <Button type="submit" className="mb-7">
            <Trans>Search</Trans>
          </Button>
        </form>
      </Section>
      <Section title={<Trans>Emails of the edition’s orders</Trans>}>
        {emails.isPending ? (
          <LoadingView />
        ) : emails.isError ? (
          <ErrorMessage error={emails.error} />
        ) : emails.data.emails.length === 0 ? (
          <p className="text-sm">
            {search ? (
              <Trans>No email matches.</Trans>
            ) : (
              <Trans>The orders of this edition sent no email yet.</Trans>
            )}
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
                  <Trans>Order</Trans>
                </TableHead>
                <TableHead scope="col">
                  <Trans>Sent</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.data.emails.map((email) => (
                <LinkRow key={email.id} to={`${base}/${email.id}`}>
                  <TableCell>
                    <RowLink to={`${base}/${email.id}`}>{t(EMAIL_KIND_LABELS[email.kind])}</RowLink>
                  </TableCell>
                  <TableCell>{email.recipient ?? <Trans>The organizers</Trans>}</TableCell>
                  <TableCell className="font-mono">{email.order.number}</TableCell>
                  <TableCell>
                    <EmailSent email={email} />
                  </TableCell>
                </LinkRow>
              ))}
            </TableBody>
          </Table>
        )}
        {page && emails.data && emails.data.total > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <Button
              variant="outline"
              disabled={page.previous === null}
              onClick={() => setOffset(page.previous ?? 0)}
            >
              <Trans>Previous page</Trans>
            </Button>
            <Button
              variant="outline"
              disabled={page.next === null}
              onClick={() => setOffset(page.next ?? 0)}
            >
              <Trans>Next page</Trans>
            </Button>
            <p aria-live="polite">
              <Trans>
                Emails {i18n.number(page.first)}–{i18n.number(page.last)} of{' '}
                {i18n.number(emails.data.total)}
              </Trans>
            </p>
          </div>
        )}
      </Section>
    </>
  )
}
