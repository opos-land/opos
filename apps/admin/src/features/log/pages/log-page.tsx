import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AdminAction } from '@opos/contract'
import { formatDateTime } from '@opos/i18n'
import { useInfiniteQuery } from '@tanstack/react-query'
import { activeLocale } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Button,
  ErrorMessage,
  LoadingView,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { logOptions } from '../api/log'

/** The log is the platform's record and names no tenant's time zone: the browser's. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * What each entry records, in words: what was done, in the past tense. The reset's English reads
 * like the button that does it, so it carries a context and is a message of its own.
 */
const ACTIONS: Record<AdminAction['action'], MessageDescriptor> = {
  'tenant.create': msg`Created the convention`,
  'tenant.rename': msg`Changed the address of the convention`,
  'tenant.suspend': msg`Suspended the convention`,
  'tenant.restore': msg`Restored the convention`,
  'tenant.delete': msg`Deleted the convention`,
  'account.reset-2fa': msg({
    message: 'Reset two-factor authentication',
    context: 'log entry',
    comment: 'Past tense: what an admin did, in the log of actions',
  }),
  'admin.grant': msg`Granted the administrator role`,
  'admin.revoke': msg`Took the administrator role away`,
}

type Named = NonNullable<AdminAction['account']>

/**
 * An account an entry names, as it is now: its name and address. An entry holds the identifier
 * alone, so an account deleted since has nothing else to show.
 */
function Account({ account }: { account: Named }) {
  if (account.email === null) return <Trans>an account deleted since</Trans>
  const name = [account.firstName, account.lastName].filter(Boolean).join(' ')
  return name ? `${name} (${account.email})` : account.email
}

/**
 * `/log`: every action of an admin, and every grant and withdrawal of the admin role, newest
 * first. Read only: the application adds an entry with each action and changes none.
 */
export function LogPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Log`)
  const log = useInfiniteQuery(logOptions())

  if (log.isPending) return <LoadingView />
  if (log.isError) {
    return (
      <section className="p-8">
        <ErrorMessage error={log.error} />
      </section>
    )
  }
  const entries = log.data.pages.flat()

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Log</Trans>}
        description={t`Every action of an administrator, newest first. Nothing here can be changed or removed.`}
      />
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Nothing has been recorded yet.</Trans>
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>When</Trans>
              </TableHead>
              <TableHead>
                <Trans>Who</Trans>
              </TableHead>
              <TableHead>
                <Trans>What</Trans>
              </TableHead>
              <TableHead>
                <Trans>On what</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  {formatDateTime(new Date(entry.createdAt), activeLocale(), browserTimeZone())}
                </TableCell>
                <TableCell>
                  {entry.admin ? (
                    <Account account={entry.admin} />
                  ) : (
                    <Trans>a script on the server</Trans>
                  )}
                </TableCell>
                <TableCell>{i18n._(ACTIONS[entry.action])}</TableCell>
                <TableCell>
                  {entry.tenant && <code>{entry.tenant.slug}</code>}
                  {entry.tenant && entry.account && ' · '}
                  {entry.account && <Account account={entry.account} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {log.hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          <Trans>Show older entries</Trans>
        </Button>
      )}
    </main>
  )
}
