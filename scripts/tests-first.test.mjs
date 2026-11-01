import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  areaOf,
  editRefusal,
  exempted,
  holdsTests,
  main,
  missingTests,
  parseNameStatus,
  parseStatus,
  touched,
} from './tests-first.mjs'

const fixtures = []
after(() => fixtures.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const guard = 'apps/api/src/common/guards/jwt-auth.guard.ts'
const apiTest = 'apps/api/test/me.test.ts'

/** A directory in no git repository. */
function outsideGit() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'no-git-')))
  fixtures.push(dir)
  return dir
}

/** Fresh content for `path`: a test file holds a test. */
const sample = (path) =>
  /\.(test|spec)\./.test(path)
    ? `it('${Math.random()}', () => {})\n`
    : `// ${path} ${Math.random()}\n`

/** A throwaway repository with one commit on `main`, and main() run inside it. */
function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tests-first-')))
  fixtures.push(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  const write = (path, content = sample(path)) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  const commit = (message, ...paths) => {
    for (const path of paths) write(path)
    git('add', '--all')
    git('commit', '-q', '--no-verify', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  // scripts/tests-first.mjs marks a checkout of this repository.
  commit('chore: start', 'README.md', 'scripts/tests-first.mjs')

  /** main() in `cwd` with `event` on stdin, its exit code and what it wrote to stderr. */
  function run(argv, event = {}, cwd = dir) {
    const messages = []
    const original = console.error
    console.error = (...args) => messages.push(args.join(' '))
    try {
      const code = main(argv, { cwd, stdin: () => JSON.stringify(event) })
      return { code, stderr: messages.join('\n') }
    } finally {
      console.error = original
    }
  }

  const edit = (path, extra = {}) =>
    run(['--hook'], { session_id: 'edit', ...extra, tool_input: { file_path: join(dir, path) } })

  /** The two Bash hooks around `command`, which changes the working tree. */
  function bash(command, session = String(Math.random())) {
    const event = { session_id: session, tool_input: { command: 'test' } }
    assert.equal(run(['--before-bash'], event).code, 0)
    command()
    return run(['--after-bash'], event)
  }

  const commitMsg = (message) => {
    write('.git/COMMIT_EDITMSG', message)
    return run(['--commit-msg', '.git/COMMIT_EDITMSG'])
  }

  return { dir, git, write, commit, run, edit, bash, commitMsg }
}

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

  it('puts every api module but mail and health, and every contract route, in rbac', () => {
    for (const path of [
      'apps/api/src/modules/accounts/accounts.repository.ts',
      'apps/api/src/modules/auth/send-email-hook.ts',
      'apps/api/src/modules/program/program.repository.ts',
      'packages/contract/src/tenants.ts',
      'packages/contract/src/me.ts',
      'packages/contract/src/invitations.ts',
      'packages/contract/src/program.ts',
    ]) {
      assert.equal(areaOf(path), 'rbac', path)
    }
    for (const path of [
      'apps/api/src/modules/mail/smtp.ts',
      'apps/api/src/modules/health/health.controller.ts',
      'packages/contract/src/errors.ts',
      'packages/contract/src/index.ts',
    ]) {
      assert.notEqual(areaOf(path), 'rbac', path)
    }
  })

  it('puts any other code in the area of its package', () => {
    for (const [path, area] of [
      ['apps/api/src/modules/mail/smtp.ts', 'api'],
      ['apps/api/src/main.ts', 'api'],
      ['apps/api/src/common/errors/api-error.ts', 'api'],
      ['apps/panel/src/app/router.tsx', 'panel'],
      ['apps/panel/env.config.ts', 'panel'],
      ['apps/portal/src/features/auth/api/auth.ts', 'portal'],
      ['packages/db/src/seed.ts', 'db'],
      ['packages/contract/src/errors.ts', 'contract'],
      ['packages/i18n/src/glossary.ts', 'i18n'],
      ['packages/eslint-config/react.js', 'eslint-config'],
      ['scripts/tests-first.mjs', 'scripts'],
      ['.claude/skills/docs-sync/scripts/check-doc-links.mjs', 'claude'],
    ]) {
      assert.equal(areaOf(path), area, path)
    }
  })

  it('puts code outside every package in an area that no test covers', () => {
    for (const path of ['tools/generate.ts', 'apps/kiosk/src/main.ts']) {
      assert.equal(areaOf(path), 'unlisted', path)
    }
  })

  it('leaves tests, their helpers and whatever is not code outside every area', () => {
    for (const path of [
      'packages/db/test/rls.test.ts',
      'apps/api/src/modules/tenants/anti-escalation.test.ts',
      'e2e/specs/portal.spec.ts',
      'apps/api/test/app.ts',
      'packages/db/test/db.ts',
      'e2e/fixtures/api.ts',
      'e2e/playwright.config.ts',
      'packages/eslint-config/fixtures/feature-app/src/app/router.ts',
      'apps/panel/vite.config.ts',
      'apps/api/vitest.config.ts',
      'apps/api/eslint.config.js',
      'apps/api/tsdown.config.ts',
      'packages/db/drizzle.config.ts',
      'packages/i18n/lingui.config.base.ts',
      'commitlint.config.mjs',
      'packages/i18n/locales/pl.d.mts',
      'apps/panel/src/locales/pl.mjs',
      'apps/panel/src/locales/pl.po',
      'apps/panel/src/styles.css',
      'packages/db/drizzle/meta/_journal.json',
      '.github/workflows/ci.yml',
      'docs/PLAN.md',
      'apps/api/dist/main.js',
      'node_modules/zod/index.js',
      '../elsewhere/x.ts',
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

  it('asks any other code for a test of its own package', () => {
    assert.deepEqual(missingTests(['apps/panel/src/app/router.tsx', 'apps/portal/src/a.test.ts']), [
      { area: 'panel', files: ['apps/panel/src/app/router.tsx'] },
    ])
    assert.deepEqual(
      missingTests(['apps/panel/src/app/router.tsx', 'apps/panel/src/app/x.test.tsx']),
      [],
    )
  })

  it('never finds a test for unlisted code', () => {
    assert.deepEqual(missingTests(['tools/generate.ts', 'tools/generate.test.ts']), [
      { area: 'unlisted', files: ['tools/generate.ts'] },
    ])
  })

  it('ignores a change that is not code', () => {
    assert.deepEqual(missingTests(['docs/PLAN.md', 'apps/panel/src/locales/pl.po']), [])
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

  it('allows editing a test, and a file that is not code', () => {
    assert.equal(editRefusal('packages/db/test/rls.test.ts', []), null)
    assert.equal(editRefusal('docs/PLAN.md', []), null)
  })

  it('refuses any other code before a test of its package changed', () => {
    assert.match(editRefusal('apps/api/src/modules/mail/smtp.ts', []) ?? '', /apps\/api/)
    assert.equal(
      editRefusal('apps/api/src/modules/mail/smtp.ts', ['apps/api/test/a.test.ts']),
      null,
    )
  })

  it('refuses unlisted code until it has an area', () => {
    assert.match(editRefusal('tools/generate.ts', []) ?? '', /outside every area/)
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

  it('reads the trailer among the other trailers, a folded line included', () => {
    assert.equal(
      exempted(
        'refactor(api): x\n\nBody.\n\nNo-Test-Reason: rename only,\n  no behaviour changes\nCo-Authored-By: A <a@example.com>\n',
      ),
      true,
    )
  })

  it('ignores the words anywhere but in the trailers', () => {
    assert.equal(
      exempted('fix(api): x\n\nNo-Test-Reason: quoted as an example\n\nMore text.\n'),
      false,
    )
    assert.equal(exempted('No-Test-Reason: the subject\n'), false)
  })

  it('reads the trailer beside other footers, as AGENTS.md asks for them', () => {
    assert.equal(
      exempted('feat(contract)!: x\n\nBody.\n\nBREAKING CHANGE: routes moved\nNo-Test-Reason: y\n'),
      true,
    )
    assert.equal(exempted('fix(api): x\n\nNo-Test-Reason: y\nRefs #12\n'), true)
  })

  it('reads every spelling git reads as the trailer', () => {
    for (const message of [
      'fix(api): x\n\nNo-Test-Reason:rename only\n',
      'fix(api): x\n\nNo-Test-Reason:\n  rename only\n',
      'fix(api): x\n\nno-test-reason: rename only\n',
      'fix(api): x\r\n\r\nNo-Test-Reason: rename only\r\n',
      'fix(api): x\n\nBody.\n---\nNo-Test-Reason: rename only\n',
    ]) {
      assert.equal(exempted(message), true, JSON.stringify(message))
    }
  })

  it('skips comment lines and everything below the scissors line, as git does', () => {
    const scissors = '# ------------------------ >8 ------------------------'
    assert.equal(exempted('fix(api): x\n\nNo-Test-Reason: y\n# Please enter the message.\n'), true)
    assert.equal(exempted(`fix(api): x\n\nNo-Test-Reason: y\n${scissors}\ndiff --git a b\n`), true)
    assert.equal(exempted(`fix(api): x\n${scissors}\n\nNo-Test-Reason: y\n`), false)
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

describe('test files without tests', () => {
  it('are told apart by a call of describe, it or test', () => {
    for (const source of [
      "describe('x', () => {})",
      "it.each([1])('x %s', () => {})",
      "test.skip('x', () => {})",
      'test `x`',
    ]) {
      assert.equal(holdsTests(source), true, source)
    }
    for (const source of ['', '// it will come\n', 'export const testing = 1\n']) {
      assert.equal(holdsTests(source), false, source)
    }
  })

  it('do not count as a test of their area', () => {
    assert.equal(missingTests([guard, { path: apiTest, deleted: false, hollow: true }]).length, 1)
  })

  it('include one that cannot be read', () => {
    const r = repo()
    mkdirSync(join(r.dir, dirname(apiTest)), { recursive: true })
    symlinkSync('missing.ts', join(r.dir, apiTest))
    assert.equal(r.edit(guard).code, 2)
  })

  it('unlock nothing in the hook, in lefthook or in CI', () => {
    const r = repo()
    r.write(apiTest, '')
    assert.equal(r.edit(guard).code, 2)
    r.write(guard)
    r.git('add', '--all')
    assert.equal(r.commitMsg('fix(api): x\n').code, 1)
    r.commit('fix(api): x')
    assert.equal(r.run(['--base', 'HEAD~1']).code, 1)
  })
})

describe('parseStatus', () => {
  it('reads every entry of git status --porcelain -z, renames in either column', () => {
    const status = [
      ' M apps/api/test/tenants-editions.test.ts',
      'M  packages/db/src/rls.ts',
      '?? scripts/a -> b.mjs',
      'R  packages/db/src/checks.ts',
      'packages/db/src/verify.ts',
      ' R packages/db/src/moved.ts',
      'packages/db/src/rls.ts',
      'C  packages/db/src/copy.ts',
      'packages/db/src/tenants.ts',
      ' D packages/db/test/old.test.ts',
      'D  apps/api/src/common/guards/gone.ts',
      '',
    ].join('\0')
    assert.deepEqual(parseStatus(status), [
      { path: 'apps/api/test/tenants-editions.test.ts', deleted: false },
      { path: 'packages/db/src/rls.ts', deleted: false },
      { path: 'scripts/a -> b.mjs', deleted: false },
      { path: 'packages/db/src/verify.ts', deleted: true },
      { path: 'packages/db/src/checks.ts', deleted: false },
      { path: 'packages/db/src/rls.ts', deleted: true },
      { path: 'packages/db/src/moved.ts', deleted: false },
      { path: 'packages/db/src/copy.ts', deleted: false },
      { path: 'packages/db/test/old.test.ts', deleted: true },
      { path: 'apps/api/src/common/guards/gone.ts', deleted: true },
    ])
  })
})

describe('parseNameStatus', () => {
  it('reads git diff --name-status -z, a rename as both of its paths and a copy as its new one', () => {
    assert.deepEqual(
      parseNameStatus(
        [
          'M',
          'a.ts',
          'D',
          'b.test.ts',
          'R100',
          'old.ts',
          'new.ts',
          'C75',
          'source.ts',
          'copy.ts',
          '',
        ].join('\0'),
      ),
      [
        { path: 'a.ts', deleted: false },
        { path: 'b.test.ts', deleted: true },
        { path: 'old.ts', deleted: true },
        { path: 'new.ts', deleted: false },
        { path: 'copy.ts', deleted: false },
      ],
    )
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

describe('--hook', () => {
  it('refuses an edit of guarded code before a test of its area changed', () => {
    const { code, stderr } = repo().edit(guard)
    assert.equal(code, 2)
    assert.match(stderr, /rbac code: write or change its test first/)
  })

  it('allows the edit once a test of its area changed', () => {
    const r = repo()
    r.write(apiTest)
    assert.equal(r.edit(guard).code, 0)
  })

  it('allows an edit outside every area, and an event without a file', () => {
    const r = repo()
    assert.equal(r.edit('docs/PLAN.md').code, 0)
    assert.equal(r.run(['--hook'], { tool_input: { command: 'ls' } }).code, 0)
  })

  it('allows an edit of a file outside the repository', () => {
    const r = repo()
    const outside = join(dirname(r.dir), 'elsewhere', guard)
    assert.equal(r.run(['--hook'], { tool_input: { file_path: outside } }).code, 0)
  })

  it('finds the area of a file reached through a symbolic link to the repository', () => {
    const r = repo()
    const link = `${r.dir}-link`
    symlinkSync(r.dir, link)
    fixtures.push(link)
    const event = { tool_input: { file_path: join(link, 'apps/api/src/common/guards/new.ts') } }
    assert.equal(r.run(['--hook'], event).code, 2)
  })

  it('refuses the edit when the check itself fails', () => {
    const r = repo()
    assert.equal(main(['--hook'], { cwd: r.dir, stdin: () => 'not json' }), 2)
    const path = process.env.PATH
    process.env.PATH = ''
    try {
      assert.equal(r.edit(guard).code, 2, 'git cannot run')
    } finally {
      process.env.PATH = path
    }
  })

  it('refuses an edit of a file that already exists', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    assert.equal(r.edit(guard).code, 2)
  })

  it('checks the repository that holds the file, whatever the session’s directory', () => {
    const r = repo()
    const event = { tool_input: { file_path: join(r.dir, guard) } }
    const { code, stderr } = r.run(['--hook'], event, outsideGit())
    assert.equal(code, 2)
    assert.match(stderr, /rbac code/)
  })

  it('allows an edit outside any git repository, or in another repository', () => {
    const away = outsideGit()
    const loose = JSON.stringify({ tool_input: { file_path: join(away, guard) } })
    assert.equal(main(['--hook'], { cwd: away, stdin: () => loose }), 0)
    const other = outsideGit()
    execFileSync('git', ['init', '-q'], { cwd: other })
    const foreign = JSON.stringify({ tool_input: { file_path: join(other, guard) } })
    assert.equal(main(['--hook'], { cwd: repo().dir, stdin: () => foreign }), 0)
  })
})

describe('--before-bash and --after-bash', () => {
  it('report guarded code a command changed while no test of its area changed', () => {
    const r = repo()
    const { code, stderr } = r.bash(() => r.write(guard))
    assert.equal(code, 2)
    assert.match(stderr, new RegExp(guard))
  })

  it('accept guarded code a command changed together with its test', () => {
    const r = repo()
    assert.equal(r.bash(() => (r.write(guard), r.write(apiTest))).code, 0)
  })

  it('ignore guarded code that was already changed before the command', () => {
    const r = repo()
    r.write(guard)
    assert.equal(r.bash(() => r.write('docs/PLAN.md')).code, 0)
  })

  it('count every changed file as the command’s when --before-bash left no record', () => {
    const r = repo()
    r.write(guard)
    const { code, stderr } = r.run(['--after-bash'], { session_id: 'never-recorded' })
    assert.equal(code, 2)
    assert.match(stderr, new RegExp(guard))
  })

  it('keep one record when the event names neither the call nor the session', () => {
    const r = repo()
    r.run(['--before-bash'], {})
    r.write(guard)
    assert.equal(r.run(['--after-bash'], {}).code, 2)
  })

  it('keep the record of each Bash call apart when calls of one session overlap', () => {
    const r = repo()
    const first = { session_id: 'one', tool_use_id: 'first' }
    const second = { session_id: 'one', tool_use_id: 'second' }
    r.run(['--before-bash'], first)
    r.write(guard)
    r.run(['--before-bash'], second)
    assert.equal(r.run(['--after-bash'], first).code, 2)
    assert.equal(r.run(['--after-bash'], second).code, 0)
  })

  it('drop their record even when they stand aside', () => {
    const r = repo()
    const event = { tool_use_id: 'during-merge' }
    r.run(['--before-bash'], event)
    r.write('.git/MERGE_HEAD', `${r.git('rev-parse', 'HEAD')}\n`)
    assert.equal(r.run(['--after-bash'], event).code, 0)
    assert.equal(existsSync(join(r.dir, '.git/tests-first-duringmerge.json')), false)
  })

  it('drop the records of calls that never reached --after-bash, after an hour', () => {
    const r = repo()
    const stale = join(r.dir, '.git/tests-first-denied.json')
    const recent = join(r.dir, '.git/tests-first-running.json')
    writeFileSync(stale, '{}')
    writeFileSync(recent, '{}')
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(stale, twoHoursAgo, twoHoursAgo)
    r.run(['--before-bash'], { tool_use_id: 'next' })
    assert.equal(existsSync(stale), false)
    assert.equal(existsSync(recent), true)
  })

  it('stand aside when the session’s directory is in no git repository', () => {
    const away = outsideGit()
    const event = () => JSON.stringify({ tool_use_id: 'away' })
    assert.equal(main(['--before-bash'], { cwd: away, stdin: event }), 0)
    assert.equal(main(['--after-bash'], { cwd: away, stdin: event }), 0)
  })

  it('report a check that fails rather than let the command pass', () => {
    const r = repo()
    assert.equal(main(['--after-bash'], { cwd: r.dir, stdin: () => '' }), 2)
  })
})

describe('renames', () => {
  // Out of rbac into db, together with a test of db: only the old path still asks for a test.
  const moved = 'packages/db/src/jwt-auth.guard.ts'
  const dbTest = 'packages/db/src/jwt-auth.guard.test.ts'
  const move = (r) => {
    mkdirSync(join(r.dir, dirname(moved)), { recursive: true })
    r.git('mv', guard, moved)
    r.write(dbTest)
  }
  const blamesTheOldPath = (stderr) => {
    assert.match(stderr, new RegExp(`rbac code[^]*${guard}`))
    assert.doesNotMatch(stderr, /db code/)
  }

  it('count a file moved out of an area as a change of that area', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    const bash = r.bash(() => move(r))
    assert.equal(bash.code, 2)
    blamesTheOldPath(bash.stderr)
    r.git('add', '--all')
    const commit = r.commitMsg('refactor(api): move the guard\n')
    assert.equal(commit.code, 1)
    blamesTheOldPath(commit.stderr)
  })

  it('reach CI as the old path too', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    move(r)
    r.commit('refactor(api): move the guard')
    const { code, stderr } = r.run(['--base', 'HEAD~1'])
    assert.equal(code, 1)
    blamesTheOldPath(stderr)
  })

  it('count a rename the index does not hold yet, as git add -N shows it', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    const { code, stderr } = r.bash(() => {
      mkdirSync(join(r.dir, dirname(moved)), { recursive: true })
      execFileSync('mv', [join(r.dir, guard), join(r.dir, moved)])
      r.git('add', '-N', moved)
      r.write(dbTest)
    })
    assert.equal(code, 2)
    blamesTheOldPath(stderr)
  })
})

describe('file names git would quote', () => {
  const odd = 'apps/panel/src/zażółć gęślą.ts'

  it('keep their area in the Bash hooks, in lefthook and in CI', () => {
    const r = repo()
    const bash = r.bash(() => r.write(odd))
    assert.equal(bash.code, 2)
    assert.match(bash.stderr, new RegExp(odd))
    r.git('add', '--all')
    assert.equal(r.commitMsg('feat(panel): x\n').code, 1)
    r.commit('feat(panel): x')
    assert.equal(r.run(['--base', 'HEAD~1']).code, 1)
  })

  it('keep an arrow that is part of the name', () => {
    const r = repo()
    const { stderr } = r.bash(() => r.write('apps/panel/src/a -> b.ts'))
    assert.match(stderr, /panel code[^]*a -> b\.ts/)
  })
})

describe('--commit-msg', () => {
  it('refuses a commit that stages guarded code without a test of its area', () => {
    const r = repo()
    r.write(guard)
    r.git('add', '--all')
    const { code, stderr } = r.commitMsg('fix(api): x\n')
    assert.equal(code, 1)
    assert.match(stderr, /No-Test-Reason/)
  })

  it('accepts the commit with the test, or with a No-Test-Reason trailer', () => {
    const r = repo()
    r.write(guard)
    r.git('add', '--all')
    assert.equal(r.commitMsg('refactor(api): x\n\nNo-Test-Reason: rename only\n').code, 0)
    r.write(apiTest)
    r.git('add', '--all')
    assert.equal(r.commitMsg('fix(api): x\n').code, 0)
  })

  it('leaves a merge commit to CI', () => {
    const r = repo()
    r.write(guard)
    r.git('add', '--all')
    r.write('.git/MERGE_HEAD', `${r.git('rev-parse', 'HEAD')}\n`)
    assert.equal(r.commitMsg('Merge branch develop\n').code, 0)
  })
})

describe('--base', () => {
  it('refuses commits since the base that change guarded code without a test', () => {
    const r = repo()
    r.commit('fix(api): x', guard)
    const { code, stderr } = r.run(['--base', 'HEAD~1'])
    assert.equal(code, 1)
    assert.match(stderr, new RegExp(guard))
  })

  it('checks each commit on its own: a later test does not cover an earlier commit', () => {
    const r = repo()
    const untested = r.commit('fix(api): guard without a test', guard)
    r.commit('test(api): an unrelated test', apiTest)
    const { code, stderr } = r.run(['--base', 'HEAD~2'])
    assert.equal(code, 1)
    assert.match(stderr, new RegExp(`${untested.slice(0, 12)} fix\\(api\\): guard without a test`))
    assert.doesNotMatch(stderr, /an unrelated test/)
  })

  it('accepts a branch with no commits of its own', () => {
    assert.equal(repo().run(['--base', 'HEAD']).code, 0)
  })

  it('accepts a commit with its test, and one with a No-Test-Reason trailer', () => {
    const r = repo()
    r.commit('fix(api): x', guard, apiTest)
    r.commit('refactor(api): y\n\nNo-Test-Reason: rename only', guard)
    assert.equal(r.run(['--base', 'HEAD~2']).code, 0)
  })
})

describe('merges', () => {
  /** `side` branches off with a tested guard change while `main` moves on; back on `main`. */
  function diverged() {
    const r = repo()
    const start = r.git('rev-parse', 'HEAD')
    r.git('switch', '-q', '-c', 'side')
    r.commit('fix(api): guard with its test', guard, apiTest)
    r.git('switch', '-q', 'main')
    r.commit('docs: x', 'docs/PLAN.md')
    return { r, start }
  }

  it('pass in CI when they add nothing beyond their parents', () => {
    const { r, start } = diverged()
    r.git('merge', '-q', '--no-edit', 'side')
    assert.equal(r.run(['--base', start]).code, 0)
  })

  it('are checked in CI for what they add beyond their parents', () => {
    const { r, start } = diverged()
    r.git('merge', '-q', '--no-commit', 'side')
    r.write('apps/api/src/common/guards/extra.ts')
    r.git('add', '--all')
    r.git('commit', '-q', '--no-verify', '-m', 'Merge branch side')
    const { code, stderr } = r.run(['--base', start])
    assert.equal(code, 1)
    assert.match(stderr, /Merge branch side/)
    assert.match(stderr, /guards\/extra\.ts/)
  })

  it('pass in CI with a No-Test-Reason trailer', () => {
    const { r, start } = diverged()
    r.git('merge', '-q', '--no-commit', 'side')
    r.write('apps/api/src/common/guards/extra.ts')
    r.git('add', '--all')
    r.git('commit', '-q', '--no-verify', '-m', 'Merge branch side\n\nNo-Test-Reason: conflict only')
    assert.equal(r.run(['--base', start]).code, 0)
  })

  it('let the hooks through while git resolves a merge, rebase, cherry-pick or revert', () => {
    for (const marker of [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'rebase-merge/head-name',
      'rebase-apply/head-name',
    ]) {
      const r = repo()
      r.write(`.git/${marker}`, `${r.git('rev-parse', 'HEAD')}\n`)
      assert.equal(r.edit(guard).code, 0, marker)
      assert.equal(r.bash(() => r.write(guard)).code, 0, marker)
    }
  })

  it('check again once a rebase has finished, though git leaves REBASE_HEAD behind', () => {
    const r = repo()
    r.write('.git/REBASE_HEAD', `${r.git('rev-parse', 'HEAD')}\n`)
    assert.equal(r.edit(guard).code, 2)
  })
})

describe('main', () => {
  it('names its modes for an unknown one', () => {
    const { code, stderr } = repo().run(['--nope'])
    assert.equal(code, 64)
    assert.match(stderr, /Usage/)
  })
})
