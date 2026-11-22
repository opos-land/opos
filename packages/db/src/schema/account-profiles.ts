import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts } from './accounts'
import { timestamps } from './columns'
import { profileInterest, profileReportReason } from './enums'

/**
 * What an account shows of itself to everyone once it publishes it
 * (docs/specs/0016-public-profile.md). A row an account from the first time it changes its
 * profile or uploads an avatar. Global, as `accounts` is: no RLS. The API never sets the public
 * identifier or what a takedown sets, and never deletes the row, so an account cannot end a
 * takedown by itself.
 */
export const accountProfiles = pgTable(
  'account_profiles',
  {
    accountId: uuid().primaryKey(),
    // What the profile's address holds: random, given by the database and never changed.
    publicId: uuid().notNull().defaultRandom(),
    // Null while the profile is private.
    publishedAt: timestamp({ withTimezone: true }),
    // Set by an admin: the profile is withdrawn and cannot be published until it is cleared.
    takenDownAt: timestamp({ withTimezone: true }),
    takenDownReason: profileReportReason(),
    // The admin's sentence for the account.
    takenDownNote: text(),
    // Whether the profile had an open report when it was taken down.
    takenDownAfterReport: boolean(),
    // The account asked for a review of its takedown.
    reviewRequestedAt: timestamp({ withTimezone: true }),
    description: text(),
    pronouns: text(),
    city: text(),
    links: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    interests: profileInterest()
      .array()
      .notNull()
      .default(sql`'{}'::profile_interest[]`),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: 'account_profiles_account_fk',
      columns: [t.accountId],
      foreignColumns: [accounts.id],
    }).onDelete('cascade'),
    unique('account_profiles_public_id_unique').on(t.publicId),
    check(
      'account_profiles_public_or_taken_down',
      sql`${t.publishedAt} is null or ${t.takenDownAt} is null`,
    ),
    // A takedown has its reason, one a rule of the platform's terms stands behind, and says
    // whether it followed a report; a profile that is not taken down holds nothing of one.
    check(
      'account_profiles_takedown',
      sql`case
        when ${t.takenDownAt} is null
          then ${t.takenDownReason} is null and ${t.takenDownNote} is null
            and ${t.takenDownAfterReport} is null and ${t.reviewRequestedAt} is null
        else ${t.takenDownReason} is not null and ${t.takenDownReason} <> 'other'
          and ${t.takenDownAfterReport} is not null
      end`,
    ),
    check('account_profiles_takedown_note', sql`char_length(${t.takenDownNote}) between 1 and 500`),
    check('account_profiles_description', sql`char_length(${t.description}) between 1 and 500`),
    check('account_profiles_pronouns', sql`char_length(${t.pronouns}) between 1 and 30`),
    check('account_profiles_city', sql`char_length(${t.city}) between 1 and 80`),
    // Up to three https addresses of up to 200 characters, none missing and none with a space.
    check(
      'account_profiles_links',
      sql`cardinality(${t.links}) <= 3
        and array_position(${t.links}, null) is null
        and array_to_string(${t.links}, '') !~ '\\s'
        and (cardinality(${t.links}) = 0
          or array_to_string(${t.links}, E'\\n') ~ '^https://\\S{1,192}(\\nhttps://\\S{1,192})*$')`,
    ),
    check(
      'account_profiles_interests',
      sql`cardinality(${t.interests}) <= 12 and array_position(${t.interests}, null) is null`,
    ),
  ],
)
