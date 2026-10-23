import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { jwtVerify } from 'jose'
import { ENV, type Env } from '../../config/env'
import { AccountsRepository } from '../../modules/accounts/accounts.repository'
import { TenantContextService } from '../als/tenant-context.service'
import { unauthenticated } from '../errors/api-error'
import { isUuid } from '../uuid'

/**
 * Verifies the Supabase Auth access token (PLAN.md 7.4) and puts its account into the request
 * store. The JWT holds no tenant; `locale` and the names come from `accounts`, not the token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly key: Uint8Array

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly accounts: AccountsRepository,
    private readonly context: TenantContextService,
  ) {
    this.key = new TextEncoder().encode(env.JWT_SECRET)
  }

  async canActivate(ctx: ExecutionContext) {
    const { headers } = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>()
    const header = typeof headers.authorization === 'string' ? headers.authorization : ''
    const token = /^Bearer (\S+)$/.exec(header)?.[1]
    if (!token) throw unauthenticated('Missing bearer token')

    let sub: string | undefined
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        audience: 'authenticated',
        issuer: this.env.AUTH_URL,
        // jose checks exp only when the claim is present; a token without one never expires.
        requiredClaims: ['exp', 'sub'],
      })
      sub = payload.sub
    } catch {
      throw unauthenticated('Invalid or expired token')
    }
    if (!isUuid(sub)) throw unauthenticated('Token without an account id')

    const account = await this.accounts.findForToken(sub)
    if (!account) throw unauthenticated('No account for this token')
    this.context.setAccount(account)
    return true
  }
}
