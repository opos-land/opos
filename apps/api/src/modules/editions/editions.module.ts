import { Module } from '@nestjs/common'
import { TenantsModule } from '../tenants/tenants.module'
import { EditionMembersController } from './edition-members.controller'
import { EditionMembersRepository } from './edition-members.repository'
import { EditionsController } from './editions.controller'
import { EditionsRepository } from './editions.repository'

@Module({
  imports: [TenantsModule],
  controllers: [EditionsController, EditionMembersController],
  providers: [EditionsRepository, EditionMembersRepository],
})
export class EditionsModule {}
