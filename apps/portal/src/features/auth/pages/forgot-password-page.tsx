import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { SIGNED_IN_HOME } from '../../../shared/config/routes'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Button, ErrorMessage, FormField, Input, linkClass, Notice } from '../../../shared/ui'
import { sendPasswordLink } from '../api/auth'
import { AuthCard } from '../components/auth-card'

const schema = z.object({ email: z.email() })

/**
 * The password reset request. The API answers an unknown address as a known one, so
 * the page confirms the message whatever the address.
 */
export function ForgotPasswordPage() {
  const { t } = useLingui()
  usePageTitle(t`Reset your password`)
  const [error, setError] = useState<unknown>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async ({ email }) => {
    setError(null)
    const failure = await sendPasswordLink(email, SIGNED_IN_HOME)
    if (failure) setError(failure)
    else setSentTo(email)
  })

  return (
    <AuthCard
      title={<Trans>Reset your password</Trans>}
      lead={<Trans>We will send you a link to set a new password.</Trans>}
    >
      {sentTo ? (
        <Notice>
          <Trans>
            If an account uses {sentTo}, we sent it a link to set a new password. The link works
            once, for one hour.
          </Trans>
        </Notice>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <FormField label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
            {(control) => (
              <Input
                {...control}
                {...form.register('email')}
                type="email"
                autoComplete="email"
                inputMode="email"
              />
            )}
          </FormField>
          <ErrorMessage error={error} />
          <Button disabled={isSubmitting} type="submit">
            <Trans>Send the link</Trans>
          </Button>
        </form>
      )}
      <Link to="/login" className={`${linkClass} text-sm`}>
        <Trans>Back to sign-in</Trans>
      </Link>
    </AuthCard>
  )
}
