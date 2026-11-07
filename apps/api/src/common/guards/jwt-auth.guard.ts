import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ENV, type Env } from '../../config/env'
import { AccountsRepository } from '../../modules/accounts/accounts.repository'
import { TenantContextService } from '../als/tenant-context.service'
import { ALLOW_MFA_PENDING } from '../decorators/allow-mfa-pending.decorator'
import { mfaRequired, unauthenticated, unavailable } from '../errors/api-error'
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  lastSignInAt,
  signInMethodsOf,
} from './access-token'
import { credentialOf, verifyOnce } from './request-credential'

/**
 * Verifies the Supabase Auth access token, from the application's access cookie
 * alone, and puts its account into the request store. The JWT holds no tenant; `locale` and the names come from `accounts`, not the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
    @Inject(ENV) private readonly env: Pick<Env, 'PORTAL_URL' | 'PANEL_URL'>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const token = credentialOf(req, this.env)
    if (!token) throw unauthenticated('Missing session')

    const check = await verifyOnce(req, this.verifier, token)
    if (check.status === 'unavailable') throw unavailable()
    if (check.status === 'invalid') {
      throw unauthenticated('Invalid or expired token, or no account id in it')
    }

    const account = await this.accounts.findForToken(check.payload.sub)
    if (!account) throw unauthenticated('No account for this token')
    // Read from the mirror, not from Supabase Auth: a token issued before `enable` loses access
    // at once. The routes that finish a sign-in carry @AllowMfaPending.
    if (account.mfaEnabled && check.payload.aal !== 'aal2' && !this.mfaPendingAllowed(ctx)) {
      throw mfaRequired()
    }
    this.context.setAccount(account, lastSignInAt(check.payload), signInMethodsOf(check.payload))
    return true
  }

  private mfaPendingAllowed(ctx: ExecutionContext) {
    // The handler alone: metadata on a controller would open every route of it.
    return this.reflector.get<boolean | undefined>(ALLOW_MFA_PENDING, ctx.getHandler()) === true
  }
}
