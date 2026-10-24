import {
  type EmailContent,
  emailChangeCurrentEmail,
  emailChangeNewEmail,
  recoveryEmail,
  signupEmail,
} from '@opos/i18n/emails'
import { z } from 'zod'

/** The part of Supabase Auth's send-email hook payload the API reads; the rest is ignored. */
export const sendEmailHookPayload = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string().min(1),
    new_email: z.string().optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  email_data: z.object({
    token_hash: z.string().min(1),
    token_hash_new: z.string().optional(),
    redirect_to: z.string().optional(),
    email_action_type: z.string(),
  }),
})

export type SendEmailHookPayload = z.infer<typeof sendEmailHookPayload>

export interface HookEmail {
  to: string
  content: EmailContent
  link: string
}

/** `<AUTH_URL>/verify?token=<token_hash>&type=<email_action_type>&redirect_to=<redirect_to>` */
export function verifyLink(authUrl: string, tokenHash: string, type: string, redirectTo?: string) {
  const query = new URLSearchParams({ token: tokenHash, type })
  if (redirectTo) query.set('redirect_to', redirectTo)
  return `${authUrl.replace(/\/+$/, '')}/verify?${query.toString()}`
}

/**
 * The emails one hook call sends (PLAN.md 10, Send-email hook), or `undefined` for an
 * `email_action_type` OPOS does not send: those flows are disabled.
 *
 * An email change asks both addresses to confirm when Supabase Auth's secure email change is on:
 * the payload then carries `token_hash_new` for the current address and `token_hash` for the new
 * one. The names are swapped on Supabase Auth's side, not here.
 */
export function hookEmails(
  payload: SendEmailHookPayload,
  authUrl: string,
): HookEmail[] | undefined {
  const { user, email_data: data } = payload
  const link = (tokenHash: string) =>
    verifyLink(authUrl, tokenHash, data.email_action_type, data.redirect_to)

  switch (data.email_action_type) {
    case 'signup':
      return [{ to: user.email, content: signupEmail, link: link(data.token_hash) }]
    case 'recovery':
      return [{ to: user.email, content: recoveryEmail, link: link(data.token_hash) }]
    case 'email_change': {
      if (!user.new_email) return undefined
      const toNew = {
        to: user.new_email,
        content: emailChangeNewEmail(user.new_email),
        link: link(data.token_hash),
      }
      if (!data.token_hash_new) return [toNew]
      const toCurrent = {
        to: user.email,
        content: emailChangeCurrentEmail(user.email, user.new_email),
        link: link(data.token_hash_new),
      }
      return [toCurrent, toNew]
    }
    default:
      return undefined
  }
}
