import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { AuthAdminClient } from './auth-admin.client'
import { AuthController } from './auth.controller'
import { MfaController } from './mfa.controller'
import { MfaService } from './mfa.service'
import { RecoveryCodesRepository } from './recovery-codes.repository'
import { GoogleAuthController } from './google-auth.controller'
import { GoogleAuthService } from './google-auth.service'
import { AuthService } from './auth.service'
import { SendEmailHookController } from './send-email-hook.controller'
import { SupabaseAuthFactory } from './supabase-auth.factory'

@Module({
  imports: [MailModule],
  controllers: [AuthController, GoogleAuthController, MfaController, SendEmailHookController],
  providers: [
    AuthAdminClient,
    AuthService,
    GoogleAuthService,
    MfaService,
    RecoveryCodesRepository,
    SupabaseAuthFactory,
  ],
  exports: [AuthAdminClient, SupabaseAuthFactory],
})
export class AuthModule {}
