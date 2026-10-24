import { auth } from '../../../shared/lib/auth'
import { accountApi } from '../../../shared/lib/api'

export const accountOptions = () => accountApi.me.get.queryOptions()

export const updateAccountOptions = () => accountApi.me.update.mutationOptions()

export const accountKey = () => accountApi.me.get.key()

export async function signOut() {
  return (await auth.signOut()).error
}
