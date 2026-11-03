import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { AccountsRepository } from '../../modules/accounts/accounts.repository'
import { TenantContextService } from '../als/tenant-context.service'
import { unauthenticated, unavailable } from '../errors/api-error'
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
  bearerToken,
  lastSignInAt,
} from './access-token'

/**
 * Verifies the Supabase Auth access token (PLAN.md 7.4) and puts its account into the request
 * store. The JWT holds no tenant; `locale` and the names come from `accounts`, not the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const { headers } = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
    const token = bearerToken(headers.authorization)
    if (!token) throw unauthenticated('Missing bearer token')

    const check = await this.verifier.verify(token)
    if (check.status === 'unavailable') throw unavailable()
    if (check.status === 'invalid') {
      throw unauthenticated('Invalid or expired token, or no account id in it')
    }

    const account = await this.accounts.findForToken(check.payload.sub)
    if (!account) throw unauthenticated('No account for this token')
    this.context.setAccount(account, lastSignInAt(check.payload))
    return true
  }
}
