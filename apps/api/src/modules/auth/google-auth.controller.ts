import { Controller, Get, Query, Req, Res } from '@nestjs/common'
import { GoogleAuthService, type GoogleRequest } from './google-auth.service'
import { type CookieResponse } from './session-cookies'

type Redirecting = CookieResponse & { redirect(status: number, url: string): void }

// Plain Nest routes, documented by contract.auth.google and contract.auth.googleCallback: a
// navigation takes a redirect, not JSON, and sends no Origin (PLAN.md 5.1).
@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly google: GoogleAuthService) {}

  @Get()
  async start(
    @Query() query: { app?: unknown; redirect?: unknown },
    @Res() res: Redirecting,
    @Req() req: GoogleRequest,
  ) {
    res.redirect(302, await this.google.start(query, req.res))
  }

  @Get('callback')
  async callback(
    @Query() query: { code?: unknown; error?: unknown; error_code?: unknown },
    @Res() res: Redirecting,
    @Req() req: GoogleRequest,
  ) {
    res.redirect(302, await this.google.callback(query, req))
  }
}
