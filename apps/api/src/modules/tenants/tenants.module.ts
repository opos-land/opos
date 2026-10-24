import { Module } from '@nestjs/common'
import { MailModule } from '../mail/mail.module'
import { InvitationsController } from './invitations.controller'
import { InvitationsRepository } from './invitations.repository'
import { InvitationsService } from './invitations.service'
import { MembersController } from './members.controller'
import { MembersRepository } from './members.repository'
import { TenantsController } from './tenants.controller'
import { TenantsRepository } from './tenants.repository'

@Module({
  imports: [MailModule],
  controllers: [TenantsController, MembersController, InvitationsController],
  providers: [TenantsRepository, MembersRepository, InvitationsRepository, InvitationsService],
  exports: [MembersRepository],
})
export class TenantsModule {}
