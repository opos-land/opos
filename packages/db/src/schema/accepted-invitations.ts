import { foreignKey, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { tenants } from './tenants'

/**
 * The organizer invitations already accepted in a tenant, by the `jti` of their token (PLAN.md
 * 7.7): an invitation works once, also after the membership it created is removed.
 */
export const acceptedInvitations = pgTable(
  'accepted_invitations',
  {
    id: id(),
    tenantId: uuid().notNull(),
    jti: uuid().notNull(),
    ...timestamps,
  },
  (t) => [
    unique('accepted_invitations_tenant_jti_unique').on(t.tenantId, t.jti),
    foreignKey({
      name: 'accepted_invitations_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
  ],
)
