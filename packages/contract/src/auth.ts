import { z } from 'zod'
import { accountSchema } from './me'
import { accountRoute, publicRoute } from './common'

const name = z.string().trim().min(1).max(100)

/** Supabase Auth judges the address itself and answers `auth.email_address_invalid`. */
export const emailSchema = z.string().trim().min(1).max(320)

/** A sign-up takes no password: the person chooses it once the link proves the address. */
export const signUpSchema = z
  .object({ email: emailSchema, firstName: name.optional(), lastName: name.optional() })
  .strict()

export const emailBodySchema = z.object({ email: emailSchema }).strict()

export const signInSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(1000) })
  .strict()

/** The links an email carries for `POST /auth/verify`. */
export const confirmationTypeSchema = z.enum(['signup', 'recovery'])

export const verifySchema = z
  .object({ tokenHash: z.string().min(1).max(1000), type: confirmationTypeSchema })
  .strict()

/** Supabase Auth hashes at most 72 bytes of a password and enforces the minimum itself. */
export const newPasswordSchema = z.string().min(1).max(72)

export const authContract = {
  signUp: publicRoute
    .route({
      method: 'POST',
      path: '/auth/sign-up',
      successStatus: 202,
      summary:
        'Register an address; the confirmation link is sent by email, the answer is always the same',
    })
    .input(z.object({ body: signUpSchema })),
  resend: publicRoute
    .route({
      method: 'POST',
      path: '/auth/resend',
      successStatus: 202,
      summary: 'Send the confirmation link again',
    })
    .input(z.object({ body: emailBodySchema })),
  verify: publicRoute
    .route({
      method: 'POST',
      path: '/auth/verify',
      summary: 'Redeem the link of an email and sign in; sets the session cookies',
    })
    .input(z.object({ body: verifySchema }))
    .output(accountSchema),
  signIn: publicRoute
    .route({
      method: 'POST',
      path: '/auth/sign-in',
      summary: 'Sign in with email and password; sets the session cookies',
    })
    .input(z.object({ body: signInSchema }))
    .output(accountSchema),
  refresh: publicRoute.route({
    method: 'POST',
    path: '/auth/refresh',
    successStatus: 204,
    summary: 'Rotate the session cookies with the refresh cookie',
  }),
  signOut: publicRoute.route({
    method: 'POST',
    path: '/auth/sign-out',
    successStatus: 204,
    summary: 'End this session only and clear its cookies',
  }),
  passwordForgot: publicRoute
    .route({
      method: 'POST',
      path: '/auth/password/forgot',
      successStatus: 202,
      summary: 'Send the password reset link; the answer is the same for any address',
    })
    .input(z.object({ body: emailBodySchema })),
  password: accountRoute
    .route({
      method: 'PUT',
      path: '/auth/password',
      successStatus: 204,
      summary:
        'Set the password and end every other session; needs a sign-in from the last 5 minutes',
    })
    .input(z.object({ body: z.object({ password: newPasswordSchema }).strict() })),
}
