import { Global, Module } from '@nestjs/common'
import { AccountsRepository } from './accounts.repository'
import { MeController } from './me.controller'

// Global: JwtAuthGuard, used by every authenticated module, needs AccountsRepository.
@Global()
@Module({
  controllers: [MeController],
  providers: [AccountsRepository],
  exports: [AccountsRepository],
})
export class MeModule {}
