import { z } from 'zod'
import { accountRoute, publicRoute, timestamp } from './common'

/**
 * The token of an organizer invitation, from the link in its email (PLAN.md 7.7). The largest
 * invitation inviteMemberSchema accepts signs a token of about 9.8k characters; the limit leaves
 * room for it and keeps `GET /invitations/preview?token=` within Node's 16 KiB header limit.
 */
export const invitationToken = z.string().min(1).max(12288)

const token = invitationToken

export const invitationPreviewSchema = z.object({
  tenant: z.object({ name: z.string() }),
  /** The address the invitation was sent to; only an account with it confirmed accepts it. */
  email: z.string(),
  validUntil: timestamp,
})

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>

export const acceptedInvitationSchema = z.object({
  tenant: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }),
})

export type AcceptedInvitation = z.infer<typeof acceptedInvitationSchema>

// Without X-Tenant-Slug: the token names the tenant.
export const invitationsContract = {
  preview: publicRoute
    .route({
      method: 'GET',
      path: '/invitations/preview',
      summary: "The convention and the invitee's email of an invitation; no sign-in",
    })
    .input(z.object({ query: z.object({ token }) }))
    .output(invitationPreviewSchema),
  accept: accountRoute
    .route({
      method: 'POST',
      path: '/invitations/accept',
      successStatus: 201,
      summary:
        "Join the convention's team the invitation names; the signed-in account's confirmed email must be the invited one",
    })
    .input(z.object({ body: z.object({ token }).strict() }))
    .output(acceptedInvitationSchema),
}
