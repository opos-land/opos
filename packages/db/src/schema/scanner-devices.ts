import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id, timestamps } from './columns'
import { editions } from './editions'
import { tenantMemberships } from './tenant-memberships'

/**
 * A scanner of an edition (docs/specs/0007-scanner.md): a device with no account, enabled by an
 * org and paired once with a code. From then on it is known by its token alone. Of the pairing
 * code and of the token only a hash is kept; the lookup of either across tenants reads the
 * identifiers that open the tenant's context, and nothing else of the device.
 */
export const scannerDevices = pgTable(
  'scanner_devices',
  {
    id: id(),
    tenantId: uuid().notNull(),
    editionId: uuid().notNull(),
    /** Such as the gate it stands at: every hand-out it marks is told by it. */
    name: text().notNull(),
    /**
     * The membership of the org who enabled it. Empty once that org left the team: the scanner
     * stays, for the hand-outs it marked, and opens nothing.
     */
    enabledByMembershipId: uuid(),
    pairingCodeHash: text().notNull(),
    pairingExpiresAt: timestamp({ withTimezone: true }).notNull(),
    /** When a phone spent the pairing code: the code works once. */
    pairedAt: timestamp({ withTimezone: true }),
    /** Empty until a phone is paired. */
    tokenHash: text(),
    /**
     * The end its org set, set once. Empty for a scanner that follows its edition: its access
     * then ends a day after the edition's last day, as that day stands whenever the end is read
     * (docs/PRODUCT.md, 7. Modules).
     */
    expiresAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('scanner_devices_tenant_edition_idx').on(t.tenantId, t.editionId),
    // What a hand-out points at: a scanner of the line's own edition.
    unique('scanner_devices_id_tenant_edition_unique').on(t.id, t.tenantId, t.editionId),
    // A name is one scanner's among those of its edition that still stand.
    uniqueIndex('scanner_devices_name_unique')
      .on(t.editionId, t.name)
      .where(sql`${t.revokedAt} is null`),
    unique('scanner_devices_pairing_code_hash_unique').on(t.pairingCodeHash),
    unique('scanner_devices_token_hash_unique').on(t.tokenHash),
    foreignKey({
      name: 'scanner_devices_edition_fk',
      columns: [t.editionId, t.tenantId],
      foreignColumns: [editions.id, editions.tenantId],
    }).onDelete('cascade'),
    // The migration narrows this to the membership's column alone: the scanner keeps its tenant
    // when the org behind it is removed.
    foreignKey({
      name: 'scanner_devices_enabled_by_fk',
      columns: [t.enabledByMembershipId, t.tenantId],
      foreignColumns: [tenantMemberships.id, tenantMemberships.tenantId],
    }).onDelete('set null'),
    check('scanner_devices_name', sql`char_length(btrim(${t.name})) between 1 and 60`),
  ],
)
