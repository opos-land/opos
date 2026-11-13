import { accountApi } from '../../../shared/lib/api'

/** The signed-in account, as `GET /me` answers. */
export const accountOptions = () => accountApi.me.get.queryOptions()
