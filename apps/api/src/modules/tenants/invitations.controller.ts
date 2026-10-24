import { Controller, UseGuards } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { InvitationsService } from './invitations.service'

// Without X-Tenant-Slug: the verified token names the tenant, and the service opens its context
// with withTenant (PLAN.md 7.2).
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Implement(contract.invitations.preview)
  preview() {
    return implement(contract.invitations.preview).handler(({ input }) =>
      this.invitations.preview(input.query.token),
    )
  }

  @Implement(contract.invitations.accept)
  @UseGuards(JwtAuthGuard)
  accept() {
    return implement(contract.invitations.accept).handler(({ input }) =>
      this.invitations.accept(input.body.token),
    )
  }
}
