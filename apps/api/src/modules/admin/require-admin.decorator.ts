import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { TenantContextService } from '../../common/als/tenant-context.service'
import { ApiError, forbidden, originDenied } from '../../common/errors/api-error'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { type ApplicationUrls, applicationFromOrigin } from '../../common/http/application'
import { ENV } from '../../config/env'
import { RECENT_SIGN_IN_SECONDS } from '../accounts/account-deletion.service'
import { ADMIN_SESSION_SECONDS } from '../auth/session-cookies'
import { AdminDbService } from './admin-db.service'

export const ADMIN_REQUIREMENT = Symbol('ADMIN_REQUIREMENT')

interface AdminRequirement {
  /** An action no screen can undo: the sign-in is younger than 5 minutes, not 30. */
  fresh: boolean
}

/**
 * Lets an admin through, and nobody else
 * (docs/adr/0030-guard-admin-access-with-its-own-role-application-and-second-factor.md). After
 * JwtAuthGuard, which reads the cookie pair of the request's `Origin` alone and holds an account
 * with two-factor authentication to `aal2`: the request comes from the admin application, so the
 * same account's session in the panel or the portal has no admin power; the account holds the
 * role, with two-factor authentication on and the factor of its grant; and it signed in within
 * the last 30 minutes, or 5 for an action that cannot be undone.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly admin: AdminDbService,
    private readonly context: TenantContextService,
    @Inject(ENV) private readonly env: ApplicationUrls,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    if (applicationFromOrigin(req.headers.origin, this.env) !== 'admin') throw originDenied()

    const grant = await this.admin.grantOf(this.context.account().id)
    if (!grant) throw forbidden('The account holds no admin role')
    if (!grant.mfaEnabled) {
      throw new ApiError(
        403,
        'admin.mfa-not-enabled',
        'An admin needs two-factor authentication on',
      )
    }
    if (!grant.bound) {
      throw new ApiError(
        403,
        'admin.grant-outdated',
        'The second factor of the account is not the one the admin role was granted with',
      )
    }

    // The handler alone: metadata on a controller would loosen every route of it.
    const requirement = this.reflector.get<AdminRequirement | undefined>(
      ADMIN_REQUIREMENT,
      ctx.getHandler(),
    )
    const window = requirement?.fresh === false ? ADMIN_SESSION_SECONDS : RECENT_SIGN_IN_SECONDS
    if (!this.context.signedInWithin(window)) {
      throw new ApiError(
        401,
        'session.reauthentication-required',
        'This route of the admin application needs a recent sign-in',
      )
    }
    return true
  }
}

/**
 * Marks an admin route: JwtAuthGuard, then AdminGuard. It goes on a method that implements one
 * route of the admin contract with @Implement. `fresh` is for an action no screen can undo.
 */
export const RequireAdmin = (options: { fresh?: boolean } = {}): MethodDecorator =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminGuard),
    SetMetadata(ADMIN_REQUIREMENT, { fresh: options.fresh === true } satisfies AdminRequirement),
  )
