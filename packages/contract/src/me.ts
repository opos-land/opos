import { SUPPORTED_LOCALES } from '@opos/i18n'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { errorSchema } from './common'

const c = initContract()

const name = z.string().trim().min(1).max(100)

export const accountSchema = z.object({
  id: z.string().uuid(),
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

const level = z.enum(['none', 'read', 'write'])

/** One of the account's memberships, edition-level permissions included; never an expired one. */
export const membershipSchema = z.object({
  tenant: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
  role: z.enum(['head', 'org']),
  settingsAccess: level,
  brandingAccess: level,
  shopConfigAccess: level,
  expiresAt: z.string().datetime().nullable(),
  editions: z.array(
    z.object({
      editionId: z.string().uuid(),
      editionSlug: z.string(),
      programAccess: level,
      websiteContentAccess: level,
      ticketsAccess: level,
    }),
  ),
})

export type Membership = z.infer<typeof membershipSchema>

export const bearer = z.object({ authorization: z.string() })

export const meContract = c.router({
  get: {
    method: 'GET',
    path: '/me',
    headers: bearer,
    responses: { 200: accountSchema, 401: errorSchema },
    summary: 'The signed-in account',
  },
  update: {
    method: 'PATCH',
    path: '/me',
    headers: bearer,
    body: updateAccountSchema,
    responses: { 200: accountSchema, 400: errorSchema, 401: errorSchema },
    summary: 'Change the name or the interface language of the signed-in account',
  },
  memberships: {
    method: 'GET',
    path: '/me/memberships',
    headers: bearer,
    responses: { 200: z.array(membershipSchema), 401: errorSchema },
    summary: "The account's memberships in every tenant",
  },
})
