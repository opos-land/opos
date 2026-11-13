import { accountApi } from '../../../shared/lib/api'

/**
 * Every convention, by name: `GET /admin/tenants`. The first admin route the application calls,
 * so its answer also says whether the signed-in account is an admin (AdminGate).
 */
export const conventionsOptions = () => accountApi.admin.tenants.queryOptions()

/** A convention with its head organizers. */
export const conventionOptions = (conventionId: string) =>
  accountApi.admin.tenant.queryOptions({ input: { params: { tenantId: conventionId } } })

/** The key of everything read through the admin routes, for a write to mark stale. */
export const adminKey = () => accountApi.admin.key()

export const createConventionOptions = () => accountApi.admin.createTenant.mutationOptions()
export const renameConventionOptions = () => accountApi.admin.renameTenant.mutationOptions()
export const suspendConventionOptions = () => accountApi.admin.suspendTenant.mutationOptions()
export const restoreConventionOptions = () => accountApi.admin.restoreTenant.mutationOptions()
export const deleteConventionOptions = () => accountApi.admin.deleteTenant.mutationOptions()
