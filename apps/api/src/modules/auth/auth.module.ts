import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthAdminClient } from './auth-admin.client'
import { SendEmailHookController } from './send-email-hook.controller'

@Module({
  imports: [MailModule],
  controllers: [SendEmailHookController],
  providers: [AuthAdminClient],
  exports: [AuthAdminClient],
})
export class AuthModule {}
