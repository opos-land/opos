import { randomUUID } from 'node:crypto'
import { editionGrantSchema, level, timestamp } from '@opos/contract'
import { errors, type JWTPayload, jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'
import { ApiError } from '../../common/errors/api-error'

/** An invitation link works for 7 days (PLAN.md 7.7). */
export const INVITATION_TTL_SECONDS = 7 * 24 * 3600

// Keeps an invitation apart from any other token signed with the same algorithm.
const AUDIENCE = 'opos:invitation'

/** What an invitation grants, as its token carries it. */
export const invitationClaimsSchema = z.object({
  tenantId: z.uuid(),
  email: z.string().min(1),
  role: z.enum(['head', 'org']),
  tenantPermissions: z.object({
    settingsAccess: level,
    brandingAccess: level,
    shopConfigAccess: level,
  }),
  editionPermissions: z.array(editionGrantSchema),
  /** The expiry of the membership the invitation creates; `null` for none. */
  expiresAt: timestamp.nullable(),
})

export type InvitationClaims = z.infer<typeof invitationClaimsSchema>

export interface VerifiedInvitation {
  claims: InvitationClaims
  /** The token's own id: an invitation is accepted once. */
  jti: string
  validUntil: Date
}

export const invitationKey = (secret: string) => new TextEncoder().encode(secret)

/** Signs an invitation with INVITE_SECRET (HS256), valid for INVITATION_TTL_SECONDS. */
export async function signInvitation(
  claims: InvitationClaims,
  key: Uint8Array,
  now = new Date(),
): Promise<{ token: string; validUntil: Date }> {
  const issuedAt = Math.floor(now.getTime() / 1000)
  const expiresAt = issuedAt + INVITATION_TTL_SECONDS
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(randomUUID())
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key)
  return { token, validUntil: new Date(expiresAt * 1000) }
}

const invalid = () => new ApiError(400, 'invitation.invalid', 'Not an invitation token')

export const invitationExpired = () =>
  new ApiError(410, 'invitation.expired', 'The invitation has expired')

/**
 * The invitation a token carries: 400 `invitation.invalid` for anything the API did not sign as an
 * invitation, 410 `invitation.expired` for one past its validity.
 */
export async function verifyInvitation(
  token: string,
  key: Uint8Array,
  now = new Date(),
): Promise<VerifiedInvitation> {
  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
      requiredClaims: ['exp', 'jti'],
      currentDate: now,
    }))
  } catch (error) {
    // jose checks the signature before the claims, so only a genuine invitation reports expiry.
    if (error instanceof errors.JWTExpired) throw invitationExpired()
    throw invalid()
  }
  const claims = invitationClaimsSchema.safeParse(payload)
  const jti = z.uuid().safeParse(payload.jti)
  if (!claims.success || !jti.success) throw invalid()
  return { claims: claims.data, jti: jti.data, validUntil: new Date(payload.exp! * 1000) }
}
