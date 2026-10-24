import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { SendEmailHookController } from './send-email-hook.controller'

@Module({ imports: [MailModule], controllers: [SendEmailHookController] })
export class AuthModule {}
