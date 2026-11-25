import { SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod'
import { accountRoute, level, timestamp } from './common'
import { plainLine } from './text'

const name = plainLine(100)
const nickname = plainLine(50)

/**
 * Where the nickname stands in an account's public name: between the first and the last name, or
 * after them.
 */
export const NAME_ORDERS = ['nickname-middle', 'nickname-last'] as const

export const nameOrderSchema = z.enum(NAME_ORDERS)

export type NameOrder = z.infer<typeof nameOrderSchema>

/** An interface theme an account can choose. */
export const themeSchema = z.enum(['light', 'dark'])

export type Theme = z.infer<typeof themeSchema>

export const accountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  nameOrder: nameOrderSchema,
  /** The account's interface language; `null` means none chosen, and the interface shows Polish. */
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
  /** The account's interface theme; `null` means follow the system's. */
  theme: themeSchema.nullable(),
  /** Whether the account holds a verified two-factor factor. */
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
    nickname: nickname.nullable(),
    nameOrder: nameOrderSchema,
    locale: z.enum(SUPPORTED_LOCALES).nullable(),
    theme: themeSchema.nullable(),
  })
  .partial()
  .strict()

export type UpdateAccount = z.infer<typeof updateAccountSchema>

/**
 * One of the account's memberships, edition-level permissions included; never an expired one. A
 * suspended tenant says so and lists no edition.
 */
export const membershipSchema = z.object({
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string(), suspended: z.boolean() }),
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
      summary:
        'Change the name, its nickname and order, the interface language or the theme of the signed-in account',
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
