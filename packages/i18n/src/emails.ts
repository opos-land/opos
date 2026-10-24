import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

// The content of Supabase Auth's emails, which the API renders in the recipient's locale when the
// send-email hook calls it (PLAN.md 10, Send-email hook).

/** One email: its subject, the paragraph above the link, the link's label and the closing note. */
export interface EmailContent {
  subject: MessageDescriptor
  body: MessageDescriptor
  action: MessageDescriptor
  ignore: MessageDescriptor
}

/** `signup`: confirming the address of a new account. */
export const signupEmail: EmailContent = {
  subject: msg`Confirm your email address`,
  body: msg`Confirm your email address to finish creating your OPOS account.`,
  action: msg`Confirm email address`,
  ignore: msg`If you did not create an account, ignore this message.`,
}

/** `recovery`: the password reset link. */
export const recoveryEmail: EmailContent = {
  subject: msg`Reset your password`,
  body: msg`We received a request to reset the password of your OPOS account. Set a new password with the link below.`,
  action: msg`Set a new password`,
  ignore: msg`If you did not ask for it, ignore this message. Your password stays the same.`,
}

/** `email_change`, sent to the new address. */
export const emailChangeNewEmail = (email: string): EmailContent => ({
  subject: msg`Confirm your new email address`,
  body: msg`Confirm that ${email} is the new email address of your OPOS account.`,
  action: msg`Confirm the new address`,
  ignore: msg`If you did not ask for this change, ignore this message.`,
})

/** `email_change`, sent to the current address when Supabase Auth asks both to confirm. */
export const emailChangeCurrentEmail = (oldEmail: string, newEmail: string): EmailContent => ({
  subject: msg`Confirm the change of your email address`,
  body: msg`We received a request to change the email address of your OPOS account from ${oldEmail} to ${newEmail}. Confirm it with the link below.`,
  action: msg`Confirm the change`,
  ignore: msg`If you did not ask for this change, do not confirm it and change your password.`,
})

/** Below the link in every email: Supabase Auth's links expire after GOTRUE_MAILER_OTP_EXP. */
export const linkValidity = msg`The link is valid for 1 hour and works once.`

export const linkFallback = msg`If the button does not work, copy this address into your browser:`
