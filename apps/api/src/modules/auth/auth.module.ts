import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthAdminClient } from './auth-admin.client'
import { AuthController } from './auth.controller'
import { GoogleAuthController } from './google-auth.controller'
import { GoogleAuthService } from './google-auth.service'
import { AuthService } from './auth.service'
import { SendEmailHookController } from './send-email-hook.controller'
import { SupabaseAuthFactory } from './supabase-auth.factory'

@Module({
  imports: [MailModule],
  controllers: [AuthController, GoogleAuthController, SendEmailHookController],
  providers: [AuthAdminClient, AuthService, GoogleAuthService, SupabaseAuthFactory],
  exports: [AuthAdminClient, SupabaseAuthFactory],
})
export class AuthModule {}
