import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  areaOf,
  editRefusal,
  exempted,
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

/** A throwaway repository with one commit on `main`, and main() run inside it. */
function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tests-first-')))
  fixtures.push(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  const write = (path, content = `// ${path}\n`) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  const commit = (message, ...paths) => {
    for (const path of paths) write(path, `// ${path} ${Math.random()}\n`)
    git('add', '--all')
    git('commit', '-q', '--no-verify', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  commit('chore: start', 'README.md')

  /** main() with `event` on stdin, its exit code and what it wrote to stderr. */
  function run(argv, event = {}) {
    const messages = []
    const original = console.error
    console.error = (...args) => messages.push(args.join(' '))
    try {
      const code = main(argv, { cwd: dir, stdin: () => JSON.stringify(event) })
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
    assert.equal(exempted('fix(api): x\n\nNo-Test-Reason: y\nand a sentence after it\n'), false)
    assert.equal(exempted('No-Test-Reason: the subject\n'), false)
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

describe('parseStatus', () => {
  it('reads every entry of git status --porcelain, the first line included', () => {
    const status = [
      ' M apps/api/test/tenants-editions.test.ts',
      'M  packages/db/src/rls.ts',
      '?? scripts/new.mjs',
      'R  packages/db/src/verify.ts -> packages/db/src/checks.ts',
      ' D packages/db/test/old.test.ts',
      'D  apps/api/src/common/guards/gone.ts',
      '',
    ].join('\n')
    assert.deepEqual(parseStatus(status), [
      { path: 'apps/api/test/tenants-editions.test.ts', deleted: false },
      { path: 'packages/db/src/rls.ts', deleted: false },
      { path: 'scripts/new.mjs', deleted: false },
      { path: 'packages/db/src/verify.ts', deleted: true },
      { path: 'packages/db/src/checks.ts', deleted: false },
      { path: 'packages/db/test/old.test.ts', deleted: true },
      { path: 'apps/api/src/common/guards/gone.ts', deleted: true },
    ])
  })
})

describe('parseNameStatus', () => {
  it('reads git diff --name-status, a rename as both of its paths and a copy as its new one', () => {
    assert.deepEqual(
      parseNameStatus('M\ta.ts\nD\tb.test.ts\nR100\told.ts\tnew.ts\nC75\tsource.ts\tcopy.ts\n'),
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
    const unreadable = main(['--hook'], { cwd: r.dir, stdin: () => 'not json' })
    assert.equal(unreadable, 2)
    const outsideGit = mkdtempSync(join(tmpdir(), 'no-git-'))
    fixtures.push(outsideGit)
    const event = JSON.stringify({ tool_input: { file_path: join(outsideGit, 'a.ts') } })
    assert.equal(main(['--hook'], { cwd: outsideGit, stdin: () => event }), 2)
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

  it('report a check that fails rather than let the command pass', () => {
    const r = repo()
    assert.equal(main(['--after-bash'], { cwd: r.dir, stdin: () => '' }), 2)
  })
})

describe('renames', () => {
  const moved = 'apps/api/src/auth/jwt-auth.guard.ts'
  const move = (r) => {
    mkdirSync(join(r.dir, dirname(moved)), { recursive: true })
    r.git('mv', guard, moved)
  }

  it('count a file moved out of an area as a change of that area', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    const { code, stderr } = r.bash(() => move(r))
    assert.equal(code, 2)
    assert.match(stderr, new RegExp(guard))
    r.write(moved, '// changed\n')
    assert.equal(r.commitMsg('refactor(api): move the guard\n').code, 1)
  })

  it('reach CI as the old path too', () => {
    const r = repo()
    r.commit('chore: add the guard', guard)
    move(r)
    r.commit('refactor(api): move the guard')
    assert.equal(r.run(['--base', 'HEAD~1']).code, 1)
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

  it('accepts a commit with its test, and one with a No-Test-Reason trailer', () => {
    const r = repo()
    r.commit('fix(api): x', guard, apiTest)
    r.commit('refactor(api): y\n\nNo-Test-Reason: rename only', guard)
    assert.equal(r.run(['--base', 'HEAD~2']).code, 0)
  })
})

describe('main', () => {
  it('names its modes for an unknown one', () => {
    const { code, stderr } = repo().run(['--nope'])
    assert.equal(code, 64)
    assert.match(stderr, /Usage/)
  })
})
