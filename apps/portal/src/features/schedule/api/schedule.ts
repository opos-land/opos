import { accountApi } from '../../../shared/lib/api'

/** The account's liked programme items in every convention (PLAN.md 5.2). */
export const scheduleOptions = () => accountApi.me.schedule.queryOptions()
