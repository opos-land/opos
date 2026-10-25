import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  areaOf,
  editRefusal,
  exempted,
  missingTests,
  parseNameStatus,
  parseStatus,
  touched,
} from './tests-first.mjs'

describe('areaOf', () => {
  it('puts the database isolation code in rls', () => {
    for (const path of [
      'packages/db/drizzle/0015_program_items.sql',
      'packages/db/src/schema/editions.ts',
      'packages/db/src/rls.ts',
      'packages/db/src/verify.ts',
      'packages/db/src/tenants.ts',
      'packages/db/src/client.ts',
      'infra/supabase/db/opos-roles.sql',
    ]) {
      assert.equal(areaOf(path), 'rls', path)
    }
  })

  it('puts tenant context and permissions in rbac', () => {
    for (const path of [
      'apps/api/src/common/permissions/permissions.ts',
      'apps/api/src/common/als/tenant-context.service.ts',
      'apps/api/src/common/guards/jwt-auth.guard.ts',
      'apps/api/src/common/database/global-db.service.ts',
      'apps/api/src/modules/tenants/anti-escalation.ts',
      'apps/api/src/modules/editions/edition-members.controller.ts',
      'apps/api/src/common/decorators/require-tenant.decorator.ts',
      'apps/api/src/app.module.ts',
      'packages/contract/src/common.ts',
    ]) {
      assert.equal(areaOf(path), 'rbac', path)
    }
  })

  it('leaves tests and everything else outside both areas', () => {
    for (const path of [
      'packages/db/test/rls.test.ts',
      'apps/api/src/modules/tenants/anti-escalation.test.ts',
      'apps/api/src/modules/mail/smtp.ts',
      'packages/db/src/seed.ts',
      'packages/db/drizzle/meta/_journal.json',
      'docs/PLAN.md',
    ]) {
      assert.equal(areaOf(path), null, path)
    }
  })
})

describe('missingTests', () => {
  it('asks for a database test when rls code changes alone', () => {
    assert.deepEqual(missingTests(['packages/db/src/verify.ts', 'docs/PLAN.md']), [
      { area: 'rls', files: ['packages/db/src/verify.ts'] },
    ])
  })

  it('accepts rls code with a test of packages/db', () => {
    assert.deepEqual(
      missingTests(['packages/db/src/verify.ts', 'packages/db/test/rls.test.ts']),
      [],
    )
  })

  it('does not count an api test for rls code', () => {
    assert.equal(
      missingTests(['packages/db/drizzle/0015_x.sql', 'apps/api/test/tenants-editions.test.ts'])
        .length,
      1,
    )
  })

  it('accepts rbac code with an api integration or unit test', () => {
    assert.deepEqual(
      missingTests(['apps/api/src/common/permissions/permissions.ts', 'apps/api/test/me.test.ts']),
      [],
    )
    assert.deepEqual(
      missingTests([
        'apps/api/src/modules/tenants/anti-escalation.ts',
        'apps/api/src/modules/tenants/anti-escalation.test.ts',
      ]),
      [],
    )
  })

  it('reports each area on its own', () => {
    assert.deepEqual(
      missingTests([
        'packages/db/src/rls.ts',
        'apps/api/src/common/guards/jwt-auth.guard.ts',
        'packages/db/test/rls.test.ts',
      ]),
      [{ area: 'rbac', files: ['apps/api/src/common/guards/jwt-auth.guard.ts'] }],
    )
  })

  it('ignores a change outside both areas', () => {
    assert.deepEqual(missingTests(['apps/panel/src/app/router.tsx']), [])
  })
})

describe('editRefusal', () => {
  it('refuses an rls edit before any database test changed', () => {
    const refusal = editRefusal('packages/db/src/schema/editions.ts', ['docs/PLAN.md'])
    assert.match(refusal ?? '', /packages\/db\/test/)
  })

  it('allows the edit once a test of its area changed', () => {
    assert.equal(
      editRefusal('packages/db/src/schema/editions.ts', ['packages/db/test/rls.test.ts']),
      null,
    )
  })

  it('allows editing a test, and a file outside both areas', () => {
    assert.equal(editRefusal('packages/db/test/rls.test.ts', []), null)
    assert.equal(editRefusal('apps/api/src/modules/mail/smtp.ts', []), null)
  })
})

describe('exempted', () => {
  it('honours a No-Test-Reason trailer', () => {
    assert.equal(exempted('refactor(api): rename a local\n\nNo-Test-Reason: rename only\n'), true)
  })

  it('needs a reason after the trailer', () => {
    assert.equal(exempted('fix(db): x\n\nNo-Test-Reason:\n'), false)
    assert.equal(exempted('fix(db): x'), false)
  })
})

describe('deletions', () => {
  it('does not count a deleted test as a test of its area', () => {
    assert.deepEqual(
      missingTests([
        'packages/db/drizzle/0016_x.sql',
        { path: 'packages/db/test/old.test.ts', deleted: true },
      ]),
      [{ area: 'rls', files: ['packages/db/drizzle/0016_x.sql'] }],
    )
    assert.match(
      editRefusal('packages/db/src/rls.ts', [
        { path: 'packages/db/test/old.test.ts', deleted: true },
      ]) ?? '',
      /packages\/db\/test/,
    )
  })

  it('counts deleted code as a change of its area', () => {
    assert.deepEqual(missingTests([{ path: 'apps/api/src/common/guards/x.ts', deleted: true }]), [
      { area: 'rbac', files: ['apps/api/src/common/guards/x.ts'] },
    ])
  })
})

describe('parseStatus', () => {
  it('reads every entry of git status --porcelain, the first line included', () => {
    const status = [
      ' M apps/api/test/tenants-editions.test.ts',
      'M  packages/db/src/rls.ts',
      '?? scripts/new.mjs',
      'R  old/name.ts -> packages/db/src/verify.ts',
      ' D packages/db/test/old.test.ts',
      'D  apps/api/src/common/guards/gone.ts',
      '',
    ].join('\n')
    assert.deepEqual(parseStatus(status), [
      { path: 'apps/api/test/tenants-editions.test.ts', deleted: false },
      { path: 'packages/db/src/rls.ts', deleted: false },
      { path: 'scripts/new.mjs', deleted: false },
      { path: 'packages/db/src/verify.ts', deleted: false },
      { path: 'packages/db/test/old.test.ts', deleted: true },
      { path: 'apps/api/src/common/guards/gone.ts', deleted: true },
    ])
  })
})

describe('parseNameStatus', () => {
  it('reads git diff --name-status, a rename as its new path', () => {
    assert.deepEqual(parseNameStatus('M\ta.ts\nD\tb.test.ts\nR100\told.ts\tnew.ts\n'), [
      { path: 'a.ts', deleted: false },
      { path: 'b.test.ts', deleted: true },
      { path: 'new.ts', deleted: false },
    ])
  })
})

describe('touched', () => {
  it('names the files whose content changed, appeared or went between two snapshots', () => {
    assert.deepEqual(touched({ a: '1', b: '2', d: '5' }, { a: '1', b: '3', c: '4' }).sort(), [
      'b',
      'c',
      'd',
    ])
  })
})
