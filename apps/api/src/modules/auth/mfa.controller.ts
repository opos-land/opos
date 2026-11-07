import { Controller, Req, UseGuards } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { AllowMfaPending } from '../../common/decorators/allow-mfa-pending.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { type AuthRequest } from './auth.service'
import { MfaService } from './mfa.service'

// Two-factor authentication. The four POST routes finish a sign-in or start 2FA, so
// they accept a session below aal2, one handler at a time; DELETE /auth/mfa does not.
@Controller()
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Implement(contract.auth.mfa.enroll)
  @AllowMfaPending()
  enroll(@Req() req: AuthRequest) {
    return implement(contract.auth.mfa.enroll).handler(() => this.mfa.enroll(req))
  }

  @Implement(contract.auth.mfa.enable)
  @AllowMfaPending()
  enable(@Req() req: AuthRequest) {
    return implement(contract.auth.mfa.enable).handler(({ input }) =>
      this.mfa.enable(req, input.body),
    )
  }

  @Implement(contract.auth.mfa.verify)
  @AllowMfaPending()
  verify(@Req() req: AuthRequest) {
    return implement(contract.auth.mfa.verify).handler(({ input }) =>
      this.mfa.verify(req, input.body),
    )
  }

  @Implement(contract.auth.mfa.recover)
  @AllowMfaPending()
  recover(@Req() req: AuthRequest) {
    return implement(contract.auth.mfa.recover).handler(({ input }) =>
      this.mfa.recover(req, input.body),
    )
  }

  @Implement(contract.auth.mfa.disable)
  disable(@Req() req: AuthRequest) {
    return implement(contract.auth.mfa.disable).handler(() => this.mfa.disable(req))
  }
}
