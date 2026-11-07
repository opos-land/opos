import { z } from 'zod'
import { accountRoute } from './common'

/** The six digits of an authenticator app. */
const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/)

export const verifyMfaSchema = z.object({ code: totpCode }).strict()

export type MfaCodeBody = z.infer<typeof verifyMfaSchema>

export const enableMfaSchema = z.object({ factorId: z.uuid(), code: totpCode }).strict()

/**
 * A recovery code as typed: the API drops spaces and hyphens and ignores the case, so the screen
 * may group the 16 characters.
 */
export const recoverSchema = z.object({ code: z.string().trim().min(1).max(64) }).strict()

export const enrollMfaOutputSchema = z.object({
  factorId: z.uuid(),
  /** A `data:` SVG of the QR code, shown once and never stored. */
  qrCode: z.string(),
  /** The same secret in base32, for typing it into the app. */
  secret: z.string(),
})

export const enableMfaOutputSchema = z.object({
  /** Ten one-time codes, shown once. */
  recoveryCodes: z.array(z.string()).length(10),
})

/** Two-factor authentication: TOTP on Supabase Auth's factors. */
export const mfaContract = {
  enroll: accountRoute
    .route({
      method: 'POST',
      path: '/auth/mfa/enroll',
      summary: 'Start enrolling an authenticator app; needs a sign-in from the last 5 minutes',
    })
    .output(enrollMfaOutputSchema),
  enable: accountRoute
    .route({
      method: 'POST',
      path: '/auth/mfa/enable',
      summary:
        'Confirm the enrolled factor with a code, turn on two-factor authentication and sign in at aal2; returns the recovery codes once',
    })
    .input(z.object({ body: enableMfaSchema }))
    .output(enableMfaOutputSchema),
  verify: accountRoute
    .route({
      method: 'POST',
      path: '/auth/mfa/verify',
      successStatus: 204,
      summary: 'Raise the session to aal2 with the code of the authenticator app',
    })
    .input(z.object({ body: verifyMfaSchema })),
  recover: accountRoute
    .route({
      method: 'POST',
      path: '/auth/mfa/recover',
      successStatus: 204,
      summary: 'Turn two-factor authentication off with a recovery code, which it spends',
    })
    .input(z.object({ body: recoverSchema })),
  disable: accountRoute.route({
    method: 'DELETE',
    path: '/auth/mfa',
    successStatus: 204,
    summary: 'Turn two-factor authentication off; needs aal2 and a sign-in from the last 5 minutes',
  }),
}
