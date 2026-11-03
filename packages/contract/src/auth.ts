import { z } from 'zod'
import { meSchema } from './me'
import { accountRoute, publicRoute, withErrors } from './common'

const name = z.string().trim().min(1).max(100)

/**
 * An address Supabase Auth would answer `validation_failed` for is `400` `request.invalid` here:
 * a format check and the 255 characters it accepts.
 */
export const emailSchema = z.string().trim().min(1).max(255).pipe(z.email())

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

/** Supabase Auth hashes at most 72 bytes, not characters, and enforces the minimum itself. */
export const newPasswordSchema = z
  .string()
  .min(1)
  .refine((password) => new TextEncoder().encode(password).length <= 72, {
    message: 'At most 72 bytes',
  })

/** The two applications that sign in through the API. */
export const applicationSchema = z.enum(['portal', 'panel'])

/** `GET /auth/google`: a `redirect` that is not a path of the application becomes its start page. */
export const googleStartQuerySchema = z.object({
  app: applicationSchema,
  redirect: z.string().optional(),
})

/** `GET /auth/google/callback`: what Supabase Auth appends, a `code` or an `error`. */
export const googleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_code: z.string().optional(),
  error_description: z.string().optional(),
})

/** A route that answers `302`, which oRPC would not document: only the `Location` is the answer. */
const redirect = (description: string) =>
  ({
    spec: (operation: Parameters<typeof withErrors>[0]) =>
      withErrors({
        ...operation,
        security: [],
        responses: {
          '302': { description, headers: { Location: { schema: { type: 'string' } } } },
        },
      }),
  }) as const

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
    .output(meSchema),
  signIn: publicRoute
    .route({
      method: 'POST',
      path: '/auth/sign-in',
      summary: 'Sign in with email and password; sets the session cookies',
    })
    .input(z.object({ body: signInSchema }))
    .output(meSchema),
  // A plain Nest route, documented here like GET /health: a redirect, not JSON.
  google: publicRoute
    .route({
      method: 'GET',
      path: '/auth/google',
      summary:
        'Start Google sign-in; a navigation that answers 302 to Supabase Auth and sets opos_google',
      ...redirect('Redirects to Supabase Auth, which sends the browser to Google'),
    })
    .input(z.object({ query: googleStartQuerySchema })),
  googleCallback: publicRoute
    .route({
      method: 'GET',
      path: '/auth/google/callback',
      summary:
        'Finish Google sign-in; sets the session cookies and answers 302 to the application, or to its /login with an error code',
      ...redirect('Redirects to a path of the application, or to its /login?error=<code>'),
    })
    .input(z.object({ query: googleCallbackQuerySchema })),
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
