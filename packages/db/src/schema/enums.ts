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
  'profile-report.close',
  'profile.take-down',
  'profile.restore',
  'account.clear-name',
])
/** An account's chosen interface theme; no choice follows the system's. */
export const theme = pgEnum('theme', ['light', 'dark'])
/**
 * Where the nickname stands in an account's public name: between the first and the last name, or
 * after them (docs/specs/0016-public-profile.md, N2).
 */
export const nameOrder = pgEnum('name_order', ['nickname-middle', 'nickname-last'])
/**
 * What an account may say it is into, of the platform's list, the same for everyone
 * (docs/specs/0016-public-profile.md, P5).
 */
export const profileInterest = pgEnum('profile_interest', [
  'tabletop-rpg',
  'larp',
  'board-games',
  'card-games',
  'miniature-wargames',
  'video-games',
  'literature',
  'comics',
  'manga-anime',
  'film-tv',
  'cosplay',
  'crafts',
])
/**
 * Why a profile is reported: someone else's picture or identity, offensive or unlawful content,
 * spam or advertising, or another reason. A takedown and a cleared name take every one but the
 * last, which no rule of the platform's terms stands behind.
 */
export const profileReportReason = pgEnum('profile_report_reason', [
  'identity',
  'offensive',
  'spam',
  'other',
])
