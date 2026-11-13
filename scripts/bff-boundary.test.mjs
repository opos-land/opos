import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, afterEach, beforeEach, describe, it, mock } from 'node:test'
import { CANARY, CONTROL, findBoundaryBreaches, main } from './bff-boundary.mjs'

const fixtures = []
after(() => fixtures.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlc2lnbmF0dXJl'

/** Every refused thing, the text that holds it and the part of its rule a breach names. */
const refused = [
  ['an import', "import { createClient } from '@supabase/supabase-js'", /@supabase/],
  ['a dependency', '"@supabase/auth-js": "^2.0.0"', /@supabase/],
  ['an address on supabase.co', 'https://abcdefgh.supabase.co/auth/v1', /address/],
  ['an address on supabase.in', 'https://abcdefgh.supabase.in/auth/v1', /address/],
  ['an address on supabase.com', 'https://abcdefgh.supabase.com', /address/],
  ['the local stack', 'http://127.0.0.1:54321/auth/v1', /address/],
  ['the local stack as a bare port', 'const url = "localhost:54321"', /address/],
  ['a publishable key', 'const key = "sb_publishable_AbCd1234"', /key/],
  ['a secret key', 'SUPABASE_KEY=sb_secret_AbCd1234', /key/],
  ['a JWT', `const token = '${jwt}'`, /JWT/],
  ['a VITE variable naming Supabase', 'VITE_SUPABASE_URL=http://x', /VITE_/],
  ['a VITE variable naming Supabase in the middle', 'VITE_APP_SUPABASE_KEY=x', /VITE_/],
]

const breaches = ({ sources = {}, dist } = {}) =>
  findBoundaryBreaches({
    sources: new Map(Object.entries(sources)),
    ...(dist ? { dist: new Map(Object.entries(dist)) } : {}),
  })

describe('findBoundaryBreaches', () => {
  for (const [what, text, rule] of refused) {
    it(`refuses ${what}, naming the file and the rule`, () => {
      const found = breaches({ sources: { 'apps/panel/src/a.ts': text } })

      assert.equal(found.length, 1)
      assert.match(found[0], /^apps\/panel\/src\/a\.ts: /)
      assert.match(found[0], rule)
    })
  }

  it('never prints the text that matched', () => {
    const secrets = ['abcdefgh', 'AbCd1234', 'c2lnbmF0dXJl', 'auth-js', 'x-private']
    const found = breaches({
      sources: {
        'apps/panel/package.json': '"@supabase/auth-js": "1"',
        'apps/panel/src/a.ts': `https://abcdefgh.supabase.co sb_secret_AbCd1234 ${jwt}`,
        'apps/portal/.env.example': 'VITE_SUPABASE_x-private=1',
      },
    })

    assert.ok(found.length >= 4)
    for (const secret of secrets) assert.doesNotMatch(found.join('\n'), new RegExp(secret))
  })

  it('lets a tree that names none of it pass', () => {
    assert.deepEqual(
      breaches({
        sources: {
          'apps/panel/src/a.ts': "const url = import.meta.env.VITE_API_URL // not supabase's",
          'apps/portal/package.json': '{ "name": "@opos/portal" }',
          'apps/portal/.env.example': 'VITE_API_URL=http://api.opos.localhost:3001',
          'apps/portal/src/b.ts': 'const port = "localhost:543210"',
        },
      }),
      [],
    )
  })

  it('checks no dist when none is given', () => {
    assert.deepEqual(breaches(), [])
  })

  const built = {
    'apps/panel/dist/a.js': CONTROL,
    'apps/portal/dist/a.js': CONTROL,
    'apps/admin/dist/a.js': CONTROL,
  }

  it('asks every application for a dist of its own, the admin application included', () => {
    assert.deepEqual(breaches({ dist: built }), [])
    const { 'apps/admin/dist/a.js': _, ...withoutAdmin } = built
    const found = breaches({ dist: withoutAdmin })

    assert.equal(found.length, 1)
    assert.match(found[0], /^apps\/admin: no dist/)
  })

  it('fails a dist without the control value, which proves nothing', () => {
    const found = breaches({ dist: { ...built, 'apps/portal/dist/a.js': 'x' } })

    assert.equal(found.length, 1)
    assert.match(found[0], /^apps\/portal: control .* not found/)
    assert.ok(found[0].includes(CONTROL))
  })

  it('does not take the control value of one application for the other', () => {
    const found = breaches({
      dist: {
        'apps/panel/dist/a.js': CONTROL,
        'apps/panel/dist/b.js': 'x',
        'apps/portal/dist/a.js': 'x',
        'apps/admin/dist/a.js': CONTROL,
      },
    })

    assert.equal(found.length, 1)
    assert.match(found[0], /^apps\/portal: control .* not found/)
  })

  it('fails an application that was not built, whatever the others hold', () => {
    const found = breaches({
      dist: { 'apps/panel/dist/a.js': CONTROL, 'apps/admin/dist/a.js': CONTROL },
    })

    assert.equal(found.length, 1)
    assert.match(found[0], /^apps\/portal: no dist/)
  })

  it('fails an empty dist, which proves nothing either', () => {
    const found = breaches({ dist: {} })

    assert.equal(found.length, 3)
    assert.match(found.join('\n'), /apps\/panel: no dist/)
    assert.match(found.join('\n'), /apps\/portal: no dist/)
    assert.match(found.join('\n'), /apps\/admin: no dist/)
  })

  it('fails a secret canary in dist', () => {
    const found = breaches({ dist: { ...built, 'apps/panel/dist/b.js': `${CONTROL} ${CANARY}` } })

    assert.equal(found.length, 1)
    assert.match(found[0], /canary/)
    assert.match(found[0], /^apps\/panel\/dist\/b\.js: /)
  })

  it('applies the rules of the sources to dist', () => {
    const found = breaches({
      dist: { ...built, 'apps/portal/dist/b.js': 'fetch("https://abcdefgh.supabase.co")' },
    })

    assert.equal(found.length, 1)
    assert.match(found[0], /^apps\/portal\/dist\/b\.js: .*address/)
    assert.doesNotMatch(found[0], /abcdefgh/)
  })

  it('lets a clean dist pass when each application holds the control value somewhere', () => {
    assert.deepEqual(
      breaches({
        dist: {
          ...built,
          'apps/panel/dist/b.js': 'x',
          'apps/portal/dist/b.js': `fetch("${CONTROL}")`,
        },
      }),
      [],
    )
  })
})

/** A throwaway repository holding `files`, and the directory to run main in. */
function repo(files = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bff-boundary-')))
  fixtures.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const write = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  write('scripts/tests-first.mjs', '')
  for (const [path, content] of Object.entries(files)) write(path, content)
  return { dir, write }
}

const breach = '@supabase/auth-js'

describe('main', () => {
  let errors
  beforeEach(() => {
    errors = []
    mock.method(console, 'error', (message) => errors.push(String(message)))
  })
  afterEach(() => mock.restoreAll())
  const run = (args, dir, stdin = () => '') => main(args, { cwd: dir, stdin })

  it('passes a clean tree, silently', () => {
    const { dir } = repo({ 'apps/panel/src/a.ts': 'export {}' })

    assert.equal(run([], dir), 0)
    assert.deepEqual(errors, [])
  })

  it('scans the files of both applications and the template, and names each breach', () => {
    const { dir } = repo({
      'apps/panel/src/a.ts': `import '${breach}'`,
      'apps/portal/package.json': `{ "dependencies": { "${breach}": "1" } }`,
      'apps/portal/.env.example': 'VITE_SUPABASE_URL=http://x',
      'apps/api/src/b.ts': `import '${breach}'`,
      'packages/x/c.ts': `import '${breach}'`,
    })

    assert.equal(run([], dir), 1)
    const output = errors.join('\n')
    assert.match(output, /apps\/panel\/src\/a\.ts: /)
    assert.match(output, /apps\/portal\/package\.json: /)
    assert.match(output, /apps\/portal\/\.env\.example: /)
    assert.doesNotMatch(output, /apps\/api|packages\/x/)
    assert.doesNotMatch(output, /auth-js/)
  })

  it('never reads an ignored env file, a built bundle or a binary file', () => {
    const { dir } = repo({
      '.gitignore': '.env\ndist/\n',
      'apps/panel/.env': 'VITE_SUPABASE_URL=https://abcdefgh.supabase.co',
      'apps/panel/dist/a.js': breach,
      'apps/panel/src/logo.png': `${breach}`,
      'apps/panel/src/a.ts': 'export {}',
    })

    assert.equal(run([], dir), 0)
  })

  it('skips a tracked file that is gone from the working tree', () => {
    const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })
    execFileSync('git', ['add', '--all'], { cwd: dir })
    rmSync(join(dir, 'apps/panel/src/a.ts'))

    assert.equal(run([], dir), 0)
  })

  it('checks the files it is given, those of the applications alone', () => {
    const { dir } = repo({
      'apps/panel/src/a.ts': `import '${breach}'`,
      'apps/panel/src/clean.ts': 'export {}',
      'apps/api/src/b.ts': `import '${breach}'`,
    })

    assert.equal(run(['apps/panel/src/clean.ts', 'apps/api/src/b.ts', 'gone.ts'], dir), 0)
    assert.equal(run(['apps/panel/src/a.ts', 'apps/api/src/b.ts'], dir), 1)
    assert.equal(run(['../outside.ts'], dir), 0)
  })

  it('reads the built bundles of every application with --dist', () => {
    const { dir, write } = repo({ 'apps/panel/src/a.ts': 'export {}' })
    write('apps/panel/dist/assets/index.js', `fetch("${CONTROL}")`)
    write('apps/portal/dist/assets/index.js', `fetch("${CONTROL}")`)
    write('apps/admin/dist/assets/index.js', `fetch("${CONTROL}")`)

    assert.equal(run(['--dist'], dir), 0)

    write('apps/portal/dist/assets/index.js.map', CANARY)
    assert.equal(run(['--dist'], dir), 1)
    assert.match(errors.join('\n'), /apps\/portal\/dist\/assets\/index\.js\.map: .*canary/)
  })

  it('fails --dist when there is no dist to scan', () => {
    const { dir } = repo({ 'apps/panel/src/a.ts': 'export {}' })

    assert.equal(run(['--dist'], dir), 1)
    assert.match(errors.join('\n'), /no dist/)
  })

  it('fails --dist when one application was not built', () => {
    const { dir, write } = repo({ 'apps/panel/src/a.ts': 'export {}' })
    write('apps/panel/dist/assets/index.js', `fetch("${CONTROL}")`)
    write('apps/admin/dist/assets/index.js', `fetch("${CONTROL}")`)

    assert.equal(run(['--dist'], dir), 1)
    assert.match(errors.join('\n'), /^apps\/portal: no dist/)
  })

  it('scans the whole checkout when run from a subdirectory', () => {
    const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })

    assert.equal(run([], join(dir, 'apps/panel/src')), 1)
    assert.match(errors.join('\n'), /apps\/panel\/src\/a\.ts: /)
  })

  it('reads the files it is given relative to the directory it runs in', () => {
    const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })

    assert.equal(run(['a.ts'], join(dir, 'apps/panel/src')), 1)
  })

  it('fails when it is not in a repository, since a scan of nothing proves nothing', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bff-boundary-none-')))
    fixtures.push(dir)

    assert.equal(run([], dir), 1)
    assert.match(errors.join('\n'), /could not check/)
  })

  it('fails when the applications list no file at all', () => {
    const { dir } = repo({ 'packages/x/a.ts': 'export {}' })

    assert.equal(run([], dir), 1)
    assert.match(errors.join('\n'), /no file/)
  })

  describe('as a Claude Code hook', () => {
    const event = (input) => () => JSON.stringify(input)

    it('checks the tree after an edit of a file of an application, and refuses with 2', () => {
      const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })

      assert.equal(
        run(
          ['--hook'],
          dir,
          event({ tool_input: { file_path: join(dir, 'apps/panel/src/a.ts') } }),
        ),
        2,
      )
      assert.match(errors.join('\n'), /apps\/panel\/src\/a\.ts: /)
    })

    it('checks the tree after a Bash command, which names no file', () => {
      const { dir } = repo({ 'apps/portal/src/a.ts': `import '${breach}'` })

      assert.equal(run(['--hook'], dir, event({ tool_name: 'Bash', tool_input: {} })), 2)
    })

    it('judges a file by the checkout that holds it, not by the session directory', () => {
      const { dir, write } = repo({ 'apps/portal/src/ok.ts': 'export {}' })
      write('.claude/worktrees/x/scripts/tests-first.mjs', '')
      write('.claude/worktrees/x/apps/panel/src/a.ts', `import '${breach}'`)
      const nested = join(dir, '.claude/worktrees/x')
      execFileSync('git', ['init', '-q'], { cwd: nested })
      const file = join(nested, 'apps/panel/src/a.ts')

      assert.equal(run(['--hook'], dir, event({ tool_input: { file_path: file } })), 2)
      assert.match(errors.join('\n'), /apps\/panel\/src\/a\.ts: /)
    })

    it('stands aside for a file in no checkout of this repository', () => {
      const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })
      const other = realpathSync(mkdtempSync(join(tmpdir(), 'bff-boundary-other-')))
      fixtures.push(other)
      mkdirSync(join(other, 'apps/panel'), { recursive: true })
      const file = join(other, 'apps/panel/a.ts')
      writeFileSync(file, breach)

      assert.equal(run(['--hook'], dir, event({ tool_input: { file_path: file } })), 0)
    })

    it('stands aside for an edit outside the applications', () => {
      const { dir } = repo({ 'apps/panel/src/a.ts': `import '${breach}'` })

      assert.equal(
        run(['--hook'], dir, event({ tool_input: { file_path: join(dir, 'apps/api/src/a.ts') } })),
        0,
      )
    })

    it('passes a clean tree', () => {
      const { dir } = repo({ 'apps/panel/src/a.ts': 'export {}' })

      assert.equal(run(['--hook'], dir, event({ tool_input: {} })), 0)
    })

    it('refuses when the event cannot be read, since it cannot check', () => {
      const { dir } = repo()

      assert.equal(
        run(['--hook'], dir, () => 'not json'),
        2,
      )
      assert.match(errors.join('\n'), /could not check/)
    })
  })
})
