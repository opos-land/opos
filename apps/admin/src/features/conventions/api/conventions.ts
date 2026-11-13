import { accountApi } from '../../../shared/lib/api'

/**
 * Every convention, by name: `GET /admin/tenants`. The first admin route the application calls,
 * so its answer also says whether the signed-in account is an admin (AdminGate).
 */
export const conventionsOptions = () => accountApi.admin.tenants.queryOptions()

/** The key of everything read through the admin routes, for a write to mark stale. */
export const adminKey = () => accountApi.admin.key()
