import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthAdminClient } from './auth-admin.client'
import { SendEmailHookController } from './send-email-hook.controller'
import { SupabaseAuthFactory } from './supabase-auth.factory'

@Module({
  imports: [MailModule],
  controllers: [SendEmailHookController],
  providers: [AuthAdminClient, SupabaseAuthFactory],
  exports: [AuthAdminClient, SupabaseAuthFactory],
})
export class AuthModule {}
