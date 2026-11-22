import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { nameRules, profileRules } from './profiles'

// The content of the emails the API renders in the recipient's locale: Supabase Auth's, sent when
// the send-email hook calls it, and the organizer invitations.

/**
 * One email: its subject, the paragraph above the link, the link's label and the closing note.
 * `validity` goes below the link: Supabase Auth's validity when omitted, nothing when `null`.
 */
export interface EmailContent {
  subject: MessageDescriptor
  body: MessageDescriptor
  action: MessageDescriptor
  validity?: MessageDescriptor | null
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

/** An organizer invitation to an address without a confirmed account: the link to accept it. */
export const invitationEmail = (tenantName: string): EmailContent => ({
  subject: msg`Invitation to the organizing team of ${tenantName}`,
  body: msg`You have been invited to the organizing team of ${tenantName} in OPOS. Accept the invitation with the link below. If you do not have an OPOS account yet, you can create one on the same page.`,
  action: msg`Accept the invitation`,
  validity: msg`The link is valid for 7 days and works once.`,
  ignore: msg`If you do not expect this invitation, ignore this message.`,
})

/** An organizer invitation to a known account, which joined the team at once. */
export const joinedTeamEmail = (tenantName: string): EmailContent => ({
  subject: msg`You have joined the organizing team of ${tenantName}`,
  body: msg`You are now a member of the organizing team of ${tenantName} in OPOS. Open the panel to see what you can work on.`,
  action: msg`Open the panel`,
  validity: null,
  ignore: msg`If you do not expect this, contact the head organizer of the convention.`,
})

/**
 * An email without a link: a notice of something that happened. `details` are further paragraphs
 * below the body, in order. `quote` is a sentence a person wrote, shown as it was written and
 * never translated, under the words that introduce it.
 */
export interface NoticeContent {
  subject: MessageDescriptor
  body: MessageDescriptor
  details?: readonly MessageDescriptor[]
  quoteIntroduction?: MessageDescriptor
  quote?: string
  note: MessageDescriptor
}

/** Two-factor authentication was turned off by a recovery code, `DELETE /auth/mfa` or an admin. */
export const mfaDisabledEmail: NoticeContent = {
  subject: msg`Two-factor authentication was turned off`,
  body: msg`Two-factor authentication was turned off for your OPOS account. You can turn it on again in your account settings.`,
  note: msg`If you did not do this, change your password right away and turn two-factor authentication on again.`,
}

// The emails of the public profile (docs/specs/0016-public-profile.md). Those to who sent a report
// hold no word of the report (R8); those to the account say what was done, under which rule of
// the platform's terms, who decided and how to contest it (T5).

/** To the address a report of a profile gave: the report arrived. */
export const profileReportReceivedEmail: NoticeContent = {
  subject: msg`We received your report of a profile`,
  body: msg`Your report of a profile on OPOS has reached the administrators. They will look at the profile and decide whether it stays.`,
  note: msg`We will write to this address once more, to say what was decided. If you sent no report, ignore this message.`,
}

/** To the address a report gave: the profile was taken down, or the report closed and the profile left. */
export const profileReportOutcomeEmail = (
  outcome: 'taken-down' | 'closed',
  contact: string,
): NoticeContent =>
  outcome === 'taken-down'
    ? {
        subject: msg`The profile you reported was taken down`,
        body: msg`The administrators looked at the profile you reported on OPOS and took it down. It is no longer public.`,
        note: msg`If you have a question about this decision, write to ${contact}.`,
      }
    : {
        subject: msg`The profile you reported stays`,
        body: msg`The administrators looked at the profile you reported on OPOS and found nothing in it against the terms. It stays as it is.`,
        note: msg`If you do not agree with this decision, write to ${contact} and say why.`,
      }

const decidedByAPerson = msg`The decision was made by a person, an administrator, and not by a program.`

/** To the account: its profile was taken down. `note` is the admin's sentence, when one was written. */
export const profileTakenDownEmail = (takedown: {
  reason: string
  afterReport: boolean
  note: string | null
  contact: string
}): NoticeContent => ({
  subject: msg`Your profile was taken down`,
  body: msg`An administrator of OPOS took your profile down. It is no longer public, your avatar was removed, and the profile cannot be published until an administrator restores it.`,
  details: [
    ...(profileRules[takedown.reason] ? [profileRules[takedown.reason]!] : []),
    takedown.afterReport
      ? msg`The decision followed a report someone sent about your profile.`
      : msg`The decision was made on the administrators’ own initiative, with no report.`,
    decidedByAPerson,
  ],
  ...(takedown.note
    ? { quoteIntroduction: msg`The administrator wrote:`, quote: takedown.note }
    : {}),
  note: msg`You can change your profile and then ask for a review on the profile page of your account. If you do not agree with the decision, write to ${takedown.contact}.`,
})

/** To the account: its profile may be published again. */
export const profileRestoredEmail: NoticeContent = {
  subject: msg`Your profile can be published again`,
  body: msg`An administrator of OPOS restored your profile. It is not public yet: publish it on the profile page of your account when you are ready.`,
  note: msg`Your avatar was removed when the profile was taken down. You can upload one again.`,
}

/** To the account: an admin cleared its first name, nickname and last name. */
export const nameClearedEmail = (cleared: { reason: string; contact: string }): NoticeContent => ({
  subject: msg`The name of your account was cleared`,
  body: msg`An administrator of OPOS cleared the name of your account: your first name, nickname and last name. Until you enter a name again, others see you as “Anon”.`,
  details: [...(nameRules[cleared.reason] ? [nameRules[cleared.reason]!] : []), decidedByAPerson],
  note: msg`You can enter your name again in your account settings. If you do not agree with the decision, write to ${cleared.contact}.`,
})
