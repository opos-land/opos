import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

// API error codes and Supabase Auth error codes (as `auth.<error_code>`) mapped onto messages.
// The client renders them with i18n._(errorMessage(code), params).

export const unknownError = msg`Something went wrong. Try again.`

export const errorMessages: Record<string, MessageDescriptor> = {
  'request.invalid': msg`Check the data you entered.`,
  'request.not-found': msg`We could not find what you are looking for.`,
  'request.rate-limited': msg`Too many attempts. Try again later.`,
  'request.busy': msg`This convention is being changed right now. Try again in a moment.`,
  'request.origin-denied': msg`This request cannot be made from this address. Reload the page and try again.`,
  'session.invalid': msg`Your session has ended. Sign in again.`,
  'session.reauthentication-required': msg`Confirm it is you: enter your password again or sign in with Google again.`,
  'session.mfa-required': msg`This account uses two-factor authentication. Enter the code from your authenticator app to continue.`,
  'mfa.code-invalid': msg`The code is wrong, has expired or was already used. Check it and try again.`,
  'mfa.already-enabled': msg`Two-factor authentication is already on for this account.`,
  'mfa.not-required': msg`This account does not need a code right now.`,
  'mfa.not-enabled': msg`Two-factor authentication is not on for this account.`,
  'permission.denied': msg`You do not have permission to do this.`,
  'server.error': unknownError,
  'server.unavailable': msg`The service is temporarily unavailable. Try again in a moment.`,
  'tenant.suspended': msg`This convention is suspended. Contact the OPOS administrators to learn more.`,
  'membership.last-head': msg`A convention must keep at least one head organizer. Make someone else a head organizer first.`,
  'member.self': msg`You cannot change your own role or permissions, or remove yourself from the team.`,
  'member.head-only': msg`Only a head organizer can edit or remove another head organizer.`,
  'member.above-own': msg`You cannot grant permissions higher than your own.`,
  'member.expiry-after-own': msg`You cannot give anyone access that lasts longer than yours.`,
  'member.outlives-own': msg`You cannot raise the permissions of someone whose access lasts longer than yours.`,
  'member.is-head': msg`A head organizer already has access to every edition.`,
  'member.exists': msg`This person is already in the team. Change their membership on the team screen.`,
  'invitation.invalid': msg`This invitation link is not valid. Check that you opened the whole link from the email.`,
  'invitation.expired': msg`This invitation has expired. Ask the convention's organizers for a new one.`,
  'invitation.used': msg`This invitation has already been accepted.`,
  'invitation.email-mismatch': msg`This invitation was sent to another email address. Sign in with the account that uses that address.`,
  'invitation.already-member': msg`You are already in this convention's team.`,
  'invitation.revoked': msg`This invitation is no longer valid: whoever sent it can no longer grant this access. Ask the convention's organizers for a new one.`,
  'edition.slug-taken': msg`This convention already has an edition with this address.`,
  'edition.active': msg`You cannot delete the active edition. Activate another edition first.`,
  'like.edition-ended': msg`This edition has ended, so its programme items take no new likes.`,
  'program.too-many-items': msg`This edition has reached the limit of programme items: {limit}.`,
  'speaker.account-not-found': msg`No confirmed account uses the email address {email}. Ask the speaker to create an account if they have none yet, and to confirm this address.`,

  'tenant.not-found': msg`We could not find this convention.`,
  'tenant.slug-invalid': msg`The address may contain only lowercase letters, digits and hyphens, 3 to 40 characters.`,
  'tenant.slug-reserved': msg`This address is reserved for the platform. Choose another one.`,
  'tenant.slug-taken': msg`This address is already taken by another convention.`,
  'tenant.name-empty': msg`Enter the convention name.`,
  'tenant.locale-invalid': msg`This language is not supported.`,
  'tenant.timezone-invalid': msg`Choose a time zone from the list.`,
  'account.not-found': msg`No account uses this email address.`,
  'account.unconfirmed': msg`The account with this email address has not been confirmed yet.`,

  'auth.invalid_credentials': msg`Wrong email or password.`,
  'auth.email_not_confirmed': msg`Confirm your email address first. Check your inbox for the link.`,
  'auth.email_exists': msg`An account with this email address already exists.`,
  'auth.user_already_exists': msg`An account with this email address already exists.`,
  'auth.email_address_invalid': msg`Enter a valid email address.`,
  'auth.weak_password': msg`The password is too weak. Use at least 8 characters.`,
  'auth.same_password': msg`The new password must differ from the current one.`,
  'auth.otp_expired': msg`The link has expired. Ask for a new one.`,
  'auth.pkce_code_verifier_not_found': msg`Open the link in the browser where you asked for it, or ask for a new link there.`,
  'auth.over_email_send_rate_limit': msg`Too many emails sent. Try again in a few minutes.`,
  'auth.over_request_rate_limit': msg`Too many attempts. Try again in a few minutes.`,
  'auth.google-failed': msg`Signing in with Google failed. Try again.`,
  'auth.signup_disabled': msg`Sign-up is closed at the moment.`,
}

/** The message for an error code; an unmapped code renders the generic message. */
export const errorMessage = (code: string): MessageDescriptor => errorMessages[code] ?? unknownError
