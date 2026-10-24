import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  INVITATION_TTL_SECONDS,
  type InvitationClaims,
  invitationKey,
  signInvitation,
  verifyInvitation,
} from './invitation-token'

const key = invitationKey('i'.repeat(32))
const claims: InvitationClaims = {
  tenantId: randomUUID(),
  email: 'invitee@example.test',
  role: 'org',
  tenantPermissions: { settingsAccess: 'read', brandingAccess: 'none', shopConfigAccess: 'none' },
  editionPermissions: [
    {
      editionId: randomUUID(),
      programAccess: 'write',
      websiteContentAccess: 'none',
      ticketsAccess: 'none',
    },
  ],
  expiresAt: null,
}

const code = async (promise: Promise<unknown>) => {
  try {
    await promise
    return 'valid'
  } catch (error) {
    return (error as { code: string }).code
  }
}

describe('invitation tokens', () => {
  it('carry the claims, an id of their own and a validity of 7 days', async () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const { token, validUntil } = await signInvitation(claims, key, now)

    const verified = await verifyInvitation(token, key, now)

    expect(verified.claims).toEqual(claims)
    expect(verified.jti).toMatch(/^[0-9a-f-]{36}$/)
    expect(validUntil.getTime() - now.getTime()).toBe(INVITATION_TTL_SECONDS * 1000)
    expect(verified.validUntil).toEqual(validUntil)
    expect(INVITATION_TTL_SECONDS).toBe(7 * 24 * 3600)
  })

  it('give each invitation another id', async () => {
    const [one, other] = await Promise.all([
      signInvitation(claims, key),
      signInvitation(claims, key),
    ])

    const [a, b] = await Promise.all([
      verifyInvitation(one.token, key),
      verifyInvitation(other.token, key),
    ])
    expect(a.jti).not.toBe(b.jti)
  })

  it('expire after their validity', async () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const { token } = await signInvitation(claims, key, now)
    const later = new Date(now.getTime() + (INVITATION_TTL_SECONDS + 1) * 1000)

    expect(await code(verifyInvitation(token, key, later))).toBe('invitation.expired')
  })

  it('refuse a token signed with another secret, even an expired one', async () => {
    const { token } = await signInvitation(claims, invitationKey('o'.repeat(32)), new Date(0))

    expect(await code(verifyInvitation(token, key))).toBe('invitation.invalid')
  })

  it('refuse a token for another audience, without an id, or without the claims', async () => {
    const sign = (jwt: SignJWT) => jwt.setProtectedHeader({ alg: 'HS256' }).sign(key)
    const valid = () => new SignJWT(claims).setExpirationTime('1h')

    for (const token of [
      await sign(valid().setJti(randomUUID()).setAudience('authenticated')),
      await sign(valid().setAudience('opos:invitation')),
      await sign(
        new SignJWT({ tenantId: claims.tenantId })
          .setJti(randomUUID())
          .setAudience('opos:invitation')
          .setExpirationTime('1h'),
      ),
      'not-a-token',
    ]) {
      expect(await code(verifyInvitation(token, key))).toBe('invitation.invalid')
    }
  })

  it('refuse a token without an expiry or with another algorithm', async () => {
    const noExpiry = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(randomUUID())
      .setAudience('opos:invitation')
      .sign(key)
    const hs512 = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS512' })
      .setJti(randomUUID())
      .setAudience('opos:invitation')
      .setExpirationTime('1h')
      .sign(new Uint8Array(64).fill(1))

    expect(await code(verifyInvitation(noExpiry, key))).toBe('invitation.invalid')
    expect(await code(verifyInvitation(hs512, key))).toBe('invitation.invalid')
  })
})
