import { SUPPORTED_LOCALES } from '@opos/i18n'
import { z } from 'zod/v4'
import { accountRoute, level } from './common'

const name = z.string().trim().min(1).max(100)

export const accountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  /** The account's interface language; `null` means detect it from Accept-Language. */
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
})

export type Account = z.infer<typeof accountSchema>

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

export const meContract = {
  get: accountRoute
    .route({ method: 'GET', path: '/me', summary: 'The signed-in account' })
    .output(accountSchema),
  update: accountRoute
    .route({
      method: 'PATCH',
      path: '/me',
      summary: 'Change the name or the interface language of the signed-in account',
    })
    .input(z.object({ body: updateAccountSchema }))
    .output(accountSchema),
  memberships: accountRoute
    .route({
      method: 'GET',
      path: '/me/memberships',
      summary: "The account's memberships in every tenant",
    })
    .output(z.array(membershipSchema)),
}
