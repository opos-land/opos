import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthAdminClient } from './auth-admin.client'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SendEmailHookController } from './send-email-hook.controller'
import { SupabaseAuthFactory } from './supabase-auth.factory'

@Module({
  imports: [MailModule],
  controllers: [AuthController, SendEmailHookController],
  providers: [AuthAdminClient, AuthService, SupabaseAuthFactory],
  exports: [AuthAdminClient, SupabaseAuthFactory],
})
export class AuthModule {}
