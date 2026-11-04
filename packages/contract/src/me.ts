import { SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod'
import { accountRoute, level, timestamp } from './common'

const name = z.string().trim().min(1).max(100)

export const accountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  /** The account's interface language; `null` means detect it from Accept-Language. */
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
  /** Whether the account holds a verified two-factor factor (PLAN.md 7.12). */
  mfaEnabled: z.boolean(),
})

export type Account = z.infer<typeof accountSchema>

/** How the access token says the person can sign in: `email` is `password`. */
export const signInMethodSchema = z.enum(['password', 'google'])

export type SignInMethod = z.infer<typeof signInMethodSchema>

/** `GET /me`: the account and the sign-in methods of the token that asked. */
export const meSchema = accountSchema.extend({ signInMethods: z.array(signInMethodSchema) })

export type Me = z.infer<typeof meSchema>

export const updateAccountSchema = z
  .object({
    firstName: name.nullable(),
    lastName: name.nullable(),
    locale: z.enum(SUPPORTED_LOCALES).nullable(),
  })
  .partial()
  .strict()

export type UpdateAccount = z.infer<typeof updateAccountSchema>

/** One of the account's memberships, edition-level permissions included; never an expired one. */
export const membershipSchema = z.object({
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
  role: z.enum(['head', 'org']),
  settingsAccess: level,
  brandingAccess: level,
  shopConfigAccess: level,
  expiresAt: z.iso.datetime().nullable(),
  editions: z.array(
    z.object({
      editionId: z.uuid(),
      editionSlug: z.string(),
      programAccess: level,
      websiteContentAccess: level,
      ticketsAccess: level,
    }),
  ),
})

export type Membership = z.infer<typeof membershipSchema>

/** A liked programme item and where it takes place, in the time zone of its convention. */
export const scheduleItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  startsAt: timestamp,
  endsAt: timestamp,
  edition: z.object({ slug: z.string(), name: z.string() }),
  tenant: z.object({ slug: z.string(), name: z.string(), timezone: z.string() }),
})

export type ScheduleItem = z.infer<typeof scheduleItemSchema>

export const meContract = {
  get: accountRoute
    .route({ method: 'GET', path: '/me', summary: 'The signed-in account' })
    .output(meSchema),
  update: accountRoute
    .route({
      method: 'PATCH',
      path: '/me',
      summary: 'Change the name or the interface language of the signed-in account',
    })
    .input(z.object({ body: updateAccountSchema }))
    .output(accountSchema),
  delete: accountRoute.route({
    method: 'DELETE',
    path: '/me',
    successStatus: 204,
    summary:
      "Delete the signed-in account; needs a sign-in from the last 5 minutes and refuses a tenant's last head",
  }),
  memberships: accountRoute
    .route({
      method: 'GET',
      path: '/me/memberships',
      summary: "The account's memberships in every tenant",
    })
    .output(z.array(membershipSchema)),
  schedule: accountRoute
    .route({
      method: 'GET',
      path: '/me/schedule',
      summary: 'The liked programme items of published editions, in every tenant, by start time',
    })
    .output(z.array(scheduleItemSchema)),
}
