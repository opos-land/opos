import { pgEnum } from 'drizzle-orm/pg-core'

export const permissionLevel = pgEnum('permission_level', ['none', 'read', 'write'])
export const tenantRole = pgEnum('tenant_role', ['head', 'org'])
/**
 * What an entry of the admins' log records: an action of the admin application, or one of the two
 * scripts that grant the admin role and take it away.
 */
export const adminAction = pgEnum('admin_action', [
  'tenant.create',
  'tenant.rename',
  'tenant.suspend',
  'tenant.restore',
  'tenant.delete',
  'account.reset-2fa',
  'admin.grant',
  'admin.revoke',
])
/** An account's chosen interface theme; no choice follows the system's. */
export const theme = pgEnum('theme', ['light', 'dark'])
