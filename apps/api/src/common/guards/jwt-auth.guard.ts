import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { ENV, type Env } from '../../config/env'
import { AccountsRepository } from '../../modules/accounts/accounts.repository'
import { TenantContextService } from '../als/tenant-context.service'
import { unauthenticated } from '../errors/api-error'
import { type AccessTokenKey, accessTokenKey, bearerToken, verifyAccessToken } from './access-token'

/**
 * Verifies the Supabase Auth access token (PLAN.md 7.4) and puts its account into the request
 * store. The JWT holds no tenant; `locale` and the names come from `accounts`, not the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly key: AccessTokenKey

  constructor(
    @Inject(ENV) env: Env,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
  ) {
    this.key = accessTokenKey(env)
  }

  async canActivate(ctx: ExecutionContext) {
    const { headers } = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
    const token = bearerToken(headers.authorization)
    if (!token) throw unauthenticated('Missing bearer token')

    const payload = await verifyAccessToken(token, this.key)
    if (!payload) throw unauthenticated('Invalid or expired token, or no account id in it')

    const account = await this.accounts.findForToken(payload.sub)
    if (!account) throw unauthenticated('No account for this token')
    this.context.setAccount(account)
    return true
  }
}
