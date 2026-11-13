import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MailModule } from '../mail/mail.module'
import { AdminController } from './admin.controller'
import { AdminDbService } from './admin-db.service'
import { AdminGuard } from './require-admin.decorator'
import { TwoFactorResetService } from './two-factor-reset.service'

/**
 * The admin routes. AppModule registers it only where the process holds the connection of
 * opos_admin (config/env.ts); elsewhere no admin route exists. AdminDbService stays inside: no
 * other module reaches the role.
 */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [AdminController],
  providers: [AdminDbService, AdminGuard, TwoFactorResetService],
})
export class AdminModule {}
