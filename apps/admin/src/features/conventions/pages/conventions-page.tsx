import { Trans, useLingui } from '@lingui/react/macro'
import { formatDateTime } from '@opos/i18n'
import { useSuspenseQuery } from '@tanstack/react-query'
import { activeLocale } from '../../../shared/lib/i18n'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Badge,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui'
import { conventionsOptions } from '../api/conventions'

/** The time zone of the browser: a convention's creation is the platform's event, not its own. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * `/`: every convention, with its address, whether it is suspended and when it was created.
 * AdminGate has the answer before this renders.
 */
export function ConventionsPage() {
  const { t } = useLingui()
  usePageTitle(t`Conventions`)
  const { data: conventions } = useSuspenseQuery(conventionsOptions())

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Conventions</Trans>}
        description={<Trans>Every convention on the platform, by name.</Trans>}
      />
      {conventions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          <Trans>No convention has been created yet.</Trans>
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Name</Trans>
              </TableHead>
              <TableHead>
                <Trans>Address</Trans>
              </TableHead>
              <TableHead>
                <Trans>Status</Trans>
              </TableHead>
              <TableHead>
                <Trans>Created</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conventions.map((convention) => (
              <TableRow key={convention.id}>
                <TableCell className="font-medium">{convention.name}</TableCell>
                <TableCell>
                  <code>{convention.slug}</code>
                </TableCell>
                <TableCell>
                  {convention.suspendedAt ? (
                    <Badge variant="destructive">
                      <Trans comment="The state of a convention the admin suspended">
                        Suspended
                      </Trans>
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Trans comment="The state of a convention that is not suspended">
                        Active
                      </Trans>
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {formatDateTime(
                    new Date(convention.createdAt),
                    activeLocale(),
                    browserTimeZone(),
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  )
}
