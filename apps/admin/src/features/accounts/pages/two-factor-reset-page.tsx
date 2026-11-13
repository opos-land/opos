import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { usePageTitle } from '../../../shared/lib/page-title'
import { FormField, Input, IrreversibleAction, PageHeader, Section } from '../../../shared/ui'
import { adminKey } from '../../conventions'
import { resetTwoFactorOptions } from '../api/accounts'

const emailAddress = z.email()

/**
 * `/two-factor-reset`: the reset of an account's two-factor authentication, for a person who lost
 * both the device and the recovery codes. No screen can undo it, so it asks first in a modal
 * (docs/ARCHITECTURE.md, Frontends). The API refuses an administrator's account and takes the
 * reset only on a sign-in of the last 5 minutes; an older one leads back to sign-in
 * (query-client.ts), and the admin repeats the reset afterwards.
 */
export function TwoFactorResetPage() {
  const { t } = useLingui()
  usePageTitle(t`Two-factor reset`)
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const address = email.trim()
  const valid = emailAddress.safeParse(address).success
  const reset = useMutation({
    ...resetTwoFactorOptions(),
    meta: {
      success: ({ emailSent }: { emailSent: boolean }) =>
        emailSent
          ? msg`Two-factor authentication of the account is reset, and the account got an email that says so.`
          : msg`Two-factor authentication of the account is reset, but the email could not be sent. Tell the person yourself.`,
    },
    onSuccess: () => {
      setEmail('')
      // The log holds a new entry.
      return queryClient.invalidateQueries({ queryKey: adminKey() })
    },
  })

  return (
    <main className="py-6">
      <PageHeader
        title={<Trans>Two-factor reset</Trans>}
        description={t`For a person who lost both their device and their recovery codes.`}
      />
      <Section title={<Trans>Account</Trans>}>
        <p className="text-sm">
          <Trans>
            The reset removes the account’s authenticator and its unused recovery codes, and the
            account gets an email that says so. An administrator’s account is never reset here: its
            role is taken away first, on the server.
          </Trans>
        </p>
        <div className="flex max-w-lg flex-col items-start gap-4">
          <FormField
            label={t`Email address of the account`}
            hint={t`The confirmed address the person signs in with.`}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
          <IrreversibleAction
            label={<Trans>Reset two-factor authentication</Trans>}
            title={<Trans>Reset two-factor authentication of {address}?</Trans>}
            action={<Trans>Reset</Trans>}
            disabled={!valid || reset.isPending}
            onConfirm={() => reset.mutateAsync({ body: { email: address } })}
          >
            <Trans>
              The account signs in with its password alone until it turns two-factor authentication
              on again.
            </Trans>
          </IrreversibleAction>
        </div>
      </Section>
    </main>
  )
}
