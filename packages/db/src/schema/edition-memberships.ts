import { foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { permissionLevel } from './enums'
import { tenantMemberships } from './tenant-memberships'

export const editionMemberships = pgTable(
  'edition_memberships',
  {
    id: id(),
    tenantId: uuid().notNull(),
    tenantMembershipId: uuid().notNull(),
    editionId: uuid().notNull(),
    programAccess: permissionLevel().notNull().default('none'),
    websiteContentAccess: permissionLevel().notNull().default('none'),
    ticketsAccess: permissionLevel().notNull().default('none'),
    ...timestamps,
  },
  (t) => [
    unique('edition_memberships_membership_edition_unique').on(t.tenantMembershipId, t.editionId),
    index('edition_memberships_tenant_edition_idx').on(t.tenantId, t.editionId),
    foreignKey({
      name: 'edition_memberships_membership_fk',
      columns: [t.tenantMembershipId, t.tenantId],
      foreignColumns: [tenantMemberships.id, tenantMemberships.tenantId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'edition_memberships_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
  ],
)
