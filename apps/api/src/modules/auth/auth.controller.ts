import { Controller, Req, UseGuards } from '@nestjs/common'
import { contract } from '@opos/contract'
import { Implement, implement } from '@orpc/nest'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AuthService } from './auth.service'
import { type CookieRequest, type CookieResponse } from './session-cookies'

/** Express sets `res` on the request; the service writes the cookies through it. */
type HttpRequest = CookieRequest & { res: CookieResponse }

// The Origin and the session cookies are read from the request, never from the contract's input
// (PLAN.md 5.1). The routes answer without a body: oRPC sends the status the contract names.
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private acceptLanguage(req: HttpRequest) {
    const header = req.headers['accept-language']
    return Array.isArray(header) ? header[0] : header
  }

  @Implement(contract.auth.signUp)
  signUp(@Req() req: HttpRequest) {
    return implement(contract.auth.signUp).handler(({ input }) =>
      this.auth.signUp(req, input.body, this.acceptLanguage(req)),
    )
  }

  @Implement(contract.auth.resend)
  resend(@Req() req: HttpRequest) {
    return implement(contract.auth.resend).handler(({ input }) =>
      this.auth.resend(req, input.body.email),
    )
  }

  @Implement(contract.auth.verify)
  verify(@Req() req: HttpRequest) {
    return implement(contract.auth.verify).handler(({ input }) => this.auth.verify(req, input.body))
  }

  @Implement(contract.auth.signIn)
  signIn(@Req() req: HttpRequest) {
    return implement(contract.auth.signIn).handler(({ input }) => this.auth.signIn(req, input.body))
  }

  @Implement(contract.auth.refresh)
  refresh(@Req() req: HttpRequest) {
    return implement(contract.auth.refresh).handler(() => this.auth.refresh(req))
  }

  @Implement(contract.auth.signOut)
  signOut(@Req() req: HttpRequest) {
    return implement(contract.auth.signOut).handler(() => this.auth.signOut(req))
  }

  @Implement(contract.auth.passwordForgot)
  passwordForgot(@Req() req: HttpRequest) {
    return implement(contract.auth.passwordForgot).handler(({ input }) =>
      this.auth.forgotPassword(req, input.body.email),
    )
  }

  @UseGuards(JwtAuthGuard)
  @Implement(contract.auth.password)
  password(@Req() req: HttpRequest) {
    return implement(contract.auth.password).handler(({ input }) =>
      this.auth.changePassword(req, input.body.password),
    )
  }
}
