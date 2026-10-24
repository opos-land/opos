import { Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AccountDeletionService } from './account-deletion.service'
import { AccountsRepository } from './accounts.repository'
import { MeController } from './me.controller'

// Global: JwtAuthGuard, used by every authenticated module, needs AccountsRepository.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [AccountsRepository, AccountDeletionService],
  exports: [AccountsRepository],
})
export class MeModule {}
