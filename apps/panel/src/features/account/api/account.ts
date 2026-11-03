import { accountApi } from '../../../shared/lib/api'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

export const accountKey = () => accountApi.me.get.key()
