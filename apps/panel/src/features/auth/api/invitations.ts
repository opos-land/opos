import { accountApi } from '../../../shared/lib/api'

export const invitationPreviewOptions = (token: string) => ({
  ...accountApi.invitations.preview.queryOptions({ input: { query: { token } } }),
  retry: false,
})

export const acceptInvitationOptions = () => accountApi.invitations.accept.mutationOptions()

/** The memberships change once an invitation is accepted. */
export const membershipsKey = () => accountApi.me.memberships.key()
