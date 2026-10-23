import { Module } from '@nestjs/common'
import { MembersController } from './members.controller'
import { MembersRepository } from './members.repository'
import { TenantsController } from './tenants.controller'
import { TenantsRepository } from './tenants.repository'

@Module({
  controllers: [TenantsController, MembersController],
  providers: [TenantsRepository, MembersRepository],
  exports: [MembersRepository],
})
export class TenantsModule {}
