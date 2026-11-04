import { SetMetadata } from '@nestjs/common'

/** The metadata key `JwtAuthGuard` reads. */
export const ALLOW_MFA_PENDING = 'allowMfaPending'

/**
 * Lets a session below `aal2` reach the route on an account with two-factor authentication
 * (PLAN.md 7.12). Only the routes that finish a sign-in carry it: `POST /auth/mfa/*`.
 */
export const AllowMfaPending = (): MethodDecorator => SetMetadata(ALLOW_MFA_PENDING, true)
