import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
import { ApiError } from '../../common/errors/api-error'
import { AccountsRepository } from '../accounts/accounts.repository'
import { MailService } from '../mail/mail.service'
import { mailFailure } from '../mail/mail-failure'
import { recipientLocale } from '../mail/recipient-locale'
import { verifyHookSignature } from './hook-signature'
import { hookEmails, sendEmailHookPayload } from './send-email-hook'

interface HookRequest {
  headers: Record<string, string | string[] | undefined>
  rawBody?: Buffer
}

/**
 * Supabase Auth sends no email itself: it calls this hook for every message. Outside
 * the oRPC contract, called server to server only. A status outside 2xx makes Supabase Auth report
 * the send as failed.
 */
@Controller('hooks')
export class SendEmailHookController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly accounts: AccountsRepository,
    private readonly mail: MailService,
  ) {}

  @Post('send-email')
  @HttpCode(200)
  async send(@Req() req: HookRequest): Promise<Record<string, never>> {
    const body = verifyHookSignature(this.env.SEND_EMAIL_HOOK_SECRET, req.rawBody, req.headers)
    if (body === undefined) {
      throw new ApiError(401, 'session.invalid', 'Missing or invalid send-email hook signature')
    }
    const parsed = sendEmailHookPayload.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(400, 'request.invalid', 'Malformed send-email hook payload')
    }
    const { user, email_data: data } = parsed.data
    const emails = hookEmails(parsed.data, {
      portalUrl: this.env.PORTAL_URL,
      panelUrl: this.env.PANEL_URL,
    })
    if (!emails) {
      throw new ApiError(
        400,
        'request.invalid',
        `Unsupported email_action_type ${data.email_action_type}`,
      )
    }

    const locale = recipientLocale({
      account: await this.accounts.localeForHook(user.id),
      signUp: user.user_metadata?.locale,
    })
    try {
      await Promise.all(emails.map((email) => this.mail.sendLinkEmail({ ...email, locale })))
    } catch (error) {
      // The 500 makes Supabase Auth report the failed send. The filter logs this error's reason
      // once; the nodemailer error itself is not passed on, as its message quotes the recipient.
      throw new ApiError(500, 'server.error', 'Internal server error', undefined, undefined, {
        expected: true,
        reason: `The email was not sent: ${mailFailure(error)}`,
      })
    }
    return {}
  }
}
