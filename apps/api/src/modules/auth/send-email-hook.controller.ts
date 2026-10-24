import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
import { ApiError } from '../../common/errors/api-error'
import { AccountsRepository } from '../accounts/accounts.repository'
import { MailService } from '../mail/mail.service'
import { recipientLocale } from '../mail/recipient-locale'
import { verifyHookSignature } from './hook-signature'
import { hookEmails, sendEmailHookPayload } from './send-email-hook'

interface HookRequest {
  headers: Record<string, string | string[] | undefined>
  rawBody?: Buffer
}

/**
 * Supabase Auth sends no email itself: it calls this hook for every message (PLAN.md 10). Outside
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
    const emails = hookEmails(parsed.data, this.env.AUTH_URL)
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
    // An SMTP failure rejects: the filter answers 500, which Supabase Auth reports to the client.
    await Promise.all(emails.map((email) => this.mail.sendLinkEmail({ ...email, locale })))
    return {}
  }
}
