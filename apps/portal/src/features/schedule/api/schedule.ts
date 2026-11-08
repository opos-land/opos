import { accountApi } from '../../../shared/lib/api'

/** The account's liked programme items in every convention. */
export const scheduleOptions = () => accountApi.me.schedule.queryOptions()
