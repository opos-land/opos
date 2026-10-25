// What every tenant route of the contract needs (PLAN.md 5, 7.3), shared by the tests that call
// each route by its need: route-requirements.test.ts and the concurrent writes of
// tenants-editions.test.ts.

export type Level = 'read' | 'write'
export type Need =
  | { scope: 'member' }
  | { scope: 'tenant'; resource: 'settings' | 'branding' | 'shop'; level: Level }
  | { scope: 'edition'; resource: 'program' | 'websiteContent' | 'tickets'; level: Level }

const anyMember: Need = { scope: 'member' }
const settings = (level: Level): Need => ({ scope: 'tenant', resource: 'settings', level })

/** Tenant routes and what each needs; a head passes every one (PRODUCT.md 5). */
export const tenantRequirements: Record<string, Need> = {
  'tenants.current': anyMember,
  'tenants.update': settings('write'),
  'tenants.members.list': settings('read'),
  'tenants.members.invite': settings('write'),
  'tenants.members.update': settings('write'),
  'tenants.members.remove': settings('write'),
  'editions.list': anyMember,
  'editions.create': settings('write'),
  'editions.get': anyMember,
  'editions.update': settings('write'),
  'editions.remove': settings('write'),
  'editions.activate': settings('write'),
  'editions.members.list': settings('read'),
  'editions.members.put': settings('write'),
  'editions.members.remove': settings('write'),
}
