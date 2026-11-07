import { zodResolver } from '@hookform/resolvers/zod'
import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { usePageTitle } from '../../../shared/lib/page-title'
import { Button, ErrorMessage, Field, inputClass, Notice } from '../../../shared/ui'
import { sendPasswordLink } from '../api/auth'
import { AuthLayout } from '../components/auth-layout'

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
    const failure = await sendPasswordLink(email, '/')
    if (failure) setError(failure)
    else setSentTo(email)
  })

  return (
    <AuthLayout title={<Trans>Reset your password</Trans>}>
      <p className="text-sm">
        <Trans>We will send you a link to set a new password.</Trans>
      </p>
      {sentTo ? (
        <Notice>
          <Trans>
            If an account uses {sentTo}, we sent it a link to set a new password. The link works
            once, for one hour.
          </Trans>
        </Notice>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <Field label={t`Email`} error={errors.email && t`Enter a valid email address.`}>
            {(control) => (
              <input
                {...control}
                {...form.register('email')}
                type="email"
                autoComplete="email"
                inputMode="email"
                className={inputClass}
              />
            )}
          </Field>
          <ErrorMessage error={error} />
          <Button type="submit" pending={isSubmitting}>
            <Trans>Send the link</Trans>
          </Button>
        </form>
      )}
      <Link to="/login" className="text-accent text-sm underline">
        <Trans>Back to sign-in</Trans>
      </Link>
    </AuthLayout>
  )
}
