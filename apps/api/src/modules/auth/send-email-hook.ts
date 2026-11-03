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

/** `<Supabase Auth>/verify?token=<token_hash>&type=<email_action_type>&redirect_to=<redirect_to>` */
export function verifyLink(authUrl: string, tokenHash: string, type: string, redirectTo?: string) {
  const query = new URLSearchParams({ token: tokenHash, type })
  if (redirectTo) query.set('redirect_to', redirectTo)
  return `${authUrl.replace(/\/+$/, '')}/verify?${query.toString()}`
}

/** The addresses a link can lead to: Supabase Auth's, and the two applications'. */
export interface HookUrls {
  authUrl: string
  portalUrl: string
  panelUrl: string
}

const CONFIRM_PATH = '/auth/confirm'

/**
 * The link of an email (PLAN.md 10, Send-email hook). `redirect_to` is `/auth/confirm` of the
 * portal or the panel, and the link goes there with `token_hash` and `type`: opening it spends
 * nothing. Any other address becomes the portal's `/auth/confirm`.
 *
 * Until the frontends move to `/auth/confirm`, another path of either application keeps the legacy
 * link through Supabase Auth's `/verify`, so it stays on the redirect list of the mixed period.
 */
export function confirmLink(urls: HookUrls, tokenHash: string, type: string, redirectTo?: string) {
  const target = parseUrl(redirectTo)
  const origins = [urls.portalUrl, urls.panelUrl].map((url) => new URL(url).origin)
  const onApplication = target !== undefined && origins.includes(target.origin)
  if (onApplication && target.pathname !== CONFIRM_PATH) {
    return verifyLink(urls.authUrl, tokenHash, type, redirectTo)
  }
  const origin = onApplication ? target.origin : new URL(urls.portalUrl).origin
  const query = new URLSearchParams({ token_hash: tokenHash, type })
  return `${origin}${CONFIRM_PATH}?${query.toString()}`
}

function parseUrl(value: string | undefined) {
  try {
    return value ? new URL(value) : undefined
  } catch {
    return undefined
  }
}

/**
 * The emails one hook call sends (PLAN.md 10, Send-email hook), or `undefined` for an
 * `email_action_type` OPOS does not send: those flows are disabled.
 *
 * An email change asks both addresses to confirm when Supabase Auth's secure email change is on:
 * the payload then carries `token_hash_new` for the current address and `token_hash` for the new
 * one. The names are swapped on Supabase Auth's side, not here.
 */
export function hookEmails(payload: SendEmailHookPayload, urls: HookUrls): HookEmail[] | undefined {
  const { user, email_data: data } = payload
  const link = (tokenHash: string) =>
    confirmLink(urls, tokenHash, data.email_action_type, data.redirect_to)

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
