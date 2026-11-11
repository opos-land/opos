import { pgEnum } from 'drizzle-orm/pg-core'

export const permissionLevel = pgEnum('permission_level', ['none', 'read', 'write'])
export const tenantRole = pgEnum('tenant_role', ['head', 'org'])
/** An account's chosen interface theme; no choice follows the system's. */
export const theme = pgEnum('theme', ['light', 'dark'])
