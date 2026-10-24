import { type Api } from '../../../shared/lib/api'

export const membersOptions = (api: Api) => api.tenants.members.list.queryOptions()

export const membersKey = (api: Api) => api.tenants.members.key()

export const inviteMemberOptions = (api: Api) => api.tenants.members.invite.mutationOptions()

export const updateMemberOptions = (api: Api) => api.tenants.members.update.mutationOptions()

export const removeMemberOptions = (api: Api) => api.tenants.members.remove.mutationOptions()

export const editionMembersOptions = (api: Api, editionId: string) =>
  api.editions.members.list.queryOptions({ input: { params: { editionId } } })

export const editionMembersKey = (api: Api) => api.editions.members.key()

export const putEditionMemberOptions = (api: Api) => api.editions.members.put.mutationOptions()

export const removeEditionMemberOptions = (api: Api) =>
  api.editions.members.remove.mutationOptions()
