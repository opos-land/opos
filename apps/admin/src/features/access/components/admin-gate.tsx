import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { errorMessage } from '@opos/i18n/errors'
import { errorCode } from '../../../shared/lib/errors'
import { useScreenTitle } from '../../../shared/lib/page-title'
import { Button, ErrorMessage, LoadingView } from '../../../shared/ui'
import { conventionsOptions } from '../../conventions'

/** The refusals that mean the signed-in account cannot use the admin application as it is. */
const REFUSALS = ['permission.denied', 'admin.mfa-not-enabled', 'admin.grant-outdated'] as const

type Refusal = (typeof REFUSALS)[number]

const isRefusal = (code: string | undefined): code is Refusal =>
  REFUSALS.some((refusal) => refusal === code)

/** One screen that says why the account has no access; the frame around it holds the sign-out. */
function NoAccessView({ code }: { code: Refusal }) {
  const { t, i18n } = useLingui()
  useScreenTitle(t`No access`)
  return (
    <section className="flex max-w-xl flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">
        {code === 'permission.denied' ? (
          <Trans>This account is not an administrator</Trans>
        ) : code === 'admin.mfa-not-enabled' ? (
          <Trans>Two-factor authentication is off</Trans>
        ) : (
          <Trans>The administrator role has to be granted again</Trans>
        )}
      </h1>
      <p className="text-muted-foreground text-sm">
        {code === 'permission.denied' ? (
          <Trans>
            Only administrators of OPOS use this application. The role is granted on the server, to
            an account with two-factor authentication on.
          </Trans>
        ) : (
          i18n._(errorMessage(code))
        )}
      </p>
    </section>
  )
}

/**
 * Lets an admin through to the screens. The API decides who that is: the first admin route
 * answers the conventions to an admin and a refusal to anyone else, and each refusal gets one
 * screen that says so: an account that is no admin, an admin who turned two-factor
 * authentication off, and an admin whose second factor is no longer the one of the grant. A
 * sign-in grown too old leads back to sign-in (query-client.ts), and this shows nothing meanwhile.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const conventions = useQuery(conventionsOptions())
  const code = errorCode(conventions.error)

  if (conventions.isPending || code === 'session.reauthentication-required') return <LoadingView />
  if (isRefusal(code)) return <NoAccessView code={code} />
  if (conventions.isError) {
    return (
      <section className="flex max-w-xl flex-col items-start gap-3 p-8">
        <ErrorMessage error={conventions.error} />
        <Button variant="outline" onClick={() => void conventions.refetch()}>
          <Trans>Try again</Trans>
        </Button>
      </section>
    )
  }
  return children
}
