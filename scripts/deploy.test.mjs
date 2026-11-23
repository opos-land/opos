import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import { deploy, newPassphrase, nodeAsk, nodeFs, nodeRun, setting, withSetting } from './deploy.mjs'

const ROOT = '/repo'
const LIVE = `${ROOT}/infra/live/dev`
const SETTINGS = `${LIVE}/env.yaml`
const PLANS = `${LIVE}/.terragrunt-plans`
const STACK = `${LIVE}/terragrunt.stack.hcl`
const UNITS = ['secrets', 'cache', 'mail', 'files', 'supabase', 'deployment', 'github', 'shared']
const STACK_HCL = UNITS.map((unit) => `unit "${unit}" {\n  path = "${unit}"\n}\n`).join('\n')
const planned = (unit) => `${PLANS}/.terragrunt-stack/${unit}/tfplan.tfplan`
const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const FILES_ID = '22222222-2222-2222-2222-222222222222'
const PASSPHRASE = 'p'.repeat(64)
const NOW = Date.parse('2026-11-20T12:00:00Z')

const ENV_YAML = [
  '# Dev',
  'scaleway:',
  '  # the project',
  '  project: opos-land-dev',
  `  project_id: ${PROJECT_ID}`,
  '  region: fr-par',
  '',
  'dns:',
  '  zone: dev.opos.land',
  '',
  'files:',
  '  # made by the bootstrap',
  '  project: dev-opos-land-files',
  '  project_id:',
  '  bucket: dev-opos-land-files',
  '',
].join('\n')

/**
 * Scaleway, Terragrunt and gh as `state` describes them; records every call with its environment
 * and input.
 */
function fakeTools(state = {}) {
  const world = {
    accessKey: 'SCWOPERATOR',
    expiresAt: undefined,
    buckets: new Set(),
    secrets: [],
    versions: 0,
    projects: [],
    domains: [],
    validated: false,
    groups: [{ id: 'group-id', name: 'opos-land-dev-operators', user_ids: ['user-a'] }],
    users: [
      { id: 'user-a', email: 'a@example.com' },
      { id: 'user-b', email: 'b@example.com' },
    ],
    stored: {},
    ghSignedIn: true,
    status: {},
    // The status each HTTP API answers with, by the start of its address
    http: {},
    // The units each exact plan of an apply's rounds plans, in turn; every one it is given when unset
    rounds: undefined,
    ...state,
  }
  world.buckets = new Set(world.buckets)
  const calls = []
  const ok = (value) => ({ status: 0, stdout: JSON.stringify(value) })

  function scw(args) {
    const words = args[0] === '-p' ? args.slice(2) : args
    const value = (name) => words.find((word) => word.startsWith(`${name}=`))?.split('=')[1]
    const command = words.slice(0, 3).join(' ')
    if (words[0] === 'login') return { status: world.status.login ?? 0, stdout: '' }
    switch (command) {
      case 'config get access-key':
        return world.accessKey
          ? { status: 0, stdout: `${world.accessKey}\n` }
          : { status: 1, stdout: '' }
      case 'config get secret-key':
        return { status: 0, stdout: 'operator-secret\n' }
      case 'config unset default-project-id':
      case 'config unset default-region':
        return { status: 0, stdout: '' }
      case `iam api-key get`:
        return world.expiresAt === null
          ? { status: 1, stdout: '' }
          : ok({ expires_at: world.expiresAt })
      case 'object bucket get':
        return { status: world.buckets.has(words[3]) ? 0 : 1, stdout: '' }
      case 'object bucket create':
        world.buckets.add(words[3])
        return ok({})
      case 'object bucket update':
        return ok({})
      case 'secret secret list':
        return ok(world.secrets.filter((secret) => secret.name === value('name')))
      case 'secret secret create':
        world.secrets.push({ id: 'passphrase-id', name: value('name') })
        return ok({ id: 'passphrase-id' })
      case 'secret version list':
        return ok(Array.from({ length: world.versions }, () => ({})))
      case 'secret version create':
        world.versions++
        return ok({})
      case 'secret version access':
        return ok({ data: Buffer.from(world.stored[value('secret-id')]).toString('base64') })
      case 'secret version access-by-path':
        return ok(world.passphrase ? { data: world.passphrase } : {})
      case 'account project list':
        return ok(world.projects)
      case 'account project create':
        world.projects.push({ id: FILES_ID, name: value('name') })
        return ok({ id: FILES_ID })
      case 'domain domain list':
        return ok(world.domains.map((domain) => ({ domain })))
      case 'domain external-domain register':
        world.domains.push(value('domain'))
        return ok({})
      case 'domain domain get':
        return ok(
          world.validated
            ? { status: 'active' }
            : {
                status: 'pending',
                external_domain_registration_status: { validation_token: 'the-token' },
              },
        )
      case 'iam group list':
        return ok(world.groups)
      case 'iam user list':
        return ok(world.users)
      case 'iam group add-members':
      case 'iam group remove-member':
        return ok({})
      default:
        throw new Error(`unexpected scw ${args.join(' ')}`)
    }
  }

  const run = (file, args, options = {}) => {
    calls.push({ file, args, env: options.env, input: options.input, capture: options.capture })
    const line = `${file} ${args.join(' ')}`
    const failing = Object.keys(world.status).find((prefix) => line.startsWith(prefix))
    if (failing) return { status: world.status[failing], stdout: '' }
    if (file === 'scw') return scw(args)
    if (file === 'terragrunt') {
      // An exact plan keeps a plan per unit it planned, where the apply finds it
      if (args.at(-1) === 'plan' && args.includes('--out-dir') && world.keep) {
        const filters = args.flatMap((arg, idx) => (args[idx - 1] === '--filter' ? [arg] : []))
        const given = filters.includes('!shared')
          ? UNITS.filter((unit) => unit !== 'shared')
          : filters
        const plans = world.rounds ? (world.rounds.shift() ?? []) : given
        for (const unit of given.filter((name) => plans.includes(name))) world.keep(planned(unit))
        return { status: plans.length < given.length ? 1 : 0, stdout: '' }
      }
      return { status: 0, stdout: '' }
    }
    if (file === 'gh')
      return { status: args[1] === 'status' && !world.ghSignedIn ? 1 : 0, stdout: '' }
    throw new Error(`unexpected ${line}`)
  }
  // Secret Manager's API and Supabase's Management API
  const requests = []
  const request = async (url, options = {}) => {
    requests.push({ url, ...options, body: options.body && JSON.parse(options.body) })
    const answering = Object.keys(world.http).find((prefix) => url.startsWith(prefix))
    const status = answering ? world.http[answering] : 200
    if (status === 'unreachable') throw new TypeError('fetch failed')
    if (status === 200 && options.method === 'POST' && url.endsWith('/versions')) world.versions++
    return { ok: status === 200, status, json: async () => ({}) }
  }
  return { run, calls, world, request, requests }
}

async function call(
  args,
  { tools = fakeTools(), files = { [SETTINGS]: ENV_YAML, [STACK]: STACK_HCL }, answers = [] } = {},
) {
  tools.world.keep = (path) => {
    files[path] = ''
  }
  const out = []
  const traced = []
  const written = []
  const asked = []
  const removed = []
  await deploy({
    args,
    root: ROOT,
    env: { HOME: '/home/op', PATH: '/bin' },
    fs: {
      exists: (path) => path in files,
      read: (path) => files[path],
      write: (path, text) => {
        files[path] = text
      },
      remove: (path) => {
        removed.push(path)
        for (const name of Object.keys(files)) {
          if (name === path || name.startsWith(`${path}/`)) delete files[name]
        }
      },
    },
    run: tools.run,
    request: tools.request,
    ask: async (question, options) => {
      asked.push({ question, hidden: options?.hidden ?? false })
      return answers.shift() ?? ''
    },
    random: () => PASSPHRASE,
    now: () => NOW,
    stdin: () => 'null',
    write: (text) => written.push(text),
    isTTY: false,
    log: (line) => out.push(line),
    trace: (line) => traced.push(line),
  })
  return { out: out.join('\n'), traced, written: written.join(''), asked, removed, files, tools }
}

const lines = (calls, file) =>
  calls.filter((entry) => entry.file === file).map(({ args }) => args.join(' '))
const scwChanges = (calls) =>
  calls
    .filter(({ file }) => file === 'scw')
    .map(({ args }) => args.slice(0, 3).join(' '))
    .filter((command) => /create|update|register|add-members|remove-member/.test(command))

describe('setting', () => {
  it('reads a plain value one level inside a top-level block', () => {
    assert.equal(setting(ENV_YAML, 'scaleway', 'project'), 'opos-land-dev')
    assert.equal(setting(ENV_YAML, 'files', 'project'), 'dev-opos-land-files')
    assert.equal(setting(ENV_YAML, 'dns', 'zone'), 'dev.opos.land')
  })

  it('reads nothing for an empty value, a missing key or a missing block', () => {
    assert.equal(setting(ENV_YAML, 'files', 'project_id'), '')
    assert.equal(setting(ENV_YAML, 'dns', 'project'), '')
    assert.equal(setting(ENV_YAML, 'cache', 'image'), '')
  })
})

describe('withSetting', () => {
  it('fills the value of a key in its block alone', () => {
    const filled = withSetting(ENV_YAML, 'files', 'project_id', FILES_ID)
    assert.equal(setting(filled, 'files', 'project_id'), FILES_ID)
    assert.equal(setting(filled, 'scaleway', 'project_id'), PROJECT_ID)
    assert.equal(filled.split('\n').length, ENV_YAML.split('\n').length)
  })

  it('refuses a key its block does not hold', () => {
    assert.throws(() => withSetting(ENV_YAML, 'dns', 'project_id', FILES_ID), /dns\.project_id/)
  })
})

describe('deploy', () => {
  it('names its commands when given none or another', async () => {
    await assert.rejects(call([]), /usage: pnpm deploy:<command>/)
    await assert.rejects(call(['unknown', 'dev']), /usage: pnpm deploy:<command>/)
  })

  it('stops for an environment without settings, before running anything', async () => {
    const tools = fakeTools()
    await assert.rejects(
      call(['plan', 'prod'], { tools }),
      /no environment has its settings at infra\/live\/prod\/env\.yaml/,
    )
    assert.equal(tools.calls.length, 0)
  })

  it('stops for settings that name no project, project id or region', async () => {
    for (const line of [
      '  project: opos-land-dev',
      `  project_id: ${PROJECT_ID}`,
      '  region: fr-par',
    ]) {
      const tools = fakeTools()
      const files = { [SETTINGS]: ENV_YAML.replace(`${line}\n`, '') }
      await assert.rejects(
        call(['output', 'dev'], { tools, files }),
        /names no scaleway project/,
        line,
      )
      assert.equal(tools.calls.length, 0)
    }
  })
})

describe('the operator key', () => {
  it("runs a command under the operator's profile, kept apart from the person's own", async () => {
    const { tools } = await call(['output', 'dev'])
    const terragrunt = tools.calls.find(({ file }) => file === 'terragrunt')
    assert.equal(terragrunt.env.SCW_PROFILE, 'opos-land-dev')
    assert.equal(terragrunt.env.SCW_CONFIG_PATH, '/home/op/.config/scw/opos-deploy.yaml')
    assert.equal(terragrunt.env.AWS_ACCESS_KEY_ID, 'SCWOPERATOR')
    assert.equal(terragrunt.env.AWS_SECRET_ACCESS_KEY, 'operator-secret')
    assert.equal(terragrunt.env.PATH, '/bin')
  })

  it('keeps the profile under XDG_CONFIG_HOME when it is set', async () => {
    const tools = fakeTools()
    await deploy({
      args: ['output', 'dev'],
      root: ROOT,
      env: { HOME: '/home/op', XDG_CONFIG_HOME: '/xdg' },
      fs: { exists: () => true, read: () => ENV_YAML },
      run: tools.run,
      log: () => {},
    })
    assert.equal(tools.calls.at(-1).env.SCW_CONFIG_PATH, '/xdg/scw/opos-deploy.yaml')
  })

  it("keeps the profile under the user's home without HOME", async () => {
    const tools = fakeTools()
    await deploy({
      args: ['output', 'dev'],
      root: ROOT,
      env: {},
      fs: { exists: () => true, read: () => ENV_YAML },
      run: tools.run,
    })
    assert.equal(
      tools.calls.at(-1).env.SCW_CONFIG_PATH,
      join(homedir(), '.config/scw/opos-deploy.yaml'),
    )
  })

  it('asks to sign in first when the profile holds no key', async () => {
    const tools = fakeTools({ accessKey: '' })
    await assert.rejects(call(['output', 'dev'], { tools }), /pnpm deploy:login dev first/)
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [])
  })
})

describe('login', () => {
  it('signs in to Scaleway for 12 hours and to GitHub, then clears the profile of its project', async () => {
    const tools = fakeTools({ accessKey: '', ghSignedIn: false })
    await call(['login', 'dev'], { tools })
    assert.deepEqual(lines(tools.calls, 'scw'), [
      'config get access-key',
      `-p opos-land-dev login project-id=${PROJECT_ID} expires-at=+12h`,
      '-p opos-land-dev config unset default-project-id',
      '-p opos-land-dev config unset default-region',
    ])
    assert.deepEqual(lines(tools.calls, 'gh'), ['auth status', 'auth login'])
    assert.equal(tools.calls[1].capture, false)
  })

  it('keeps a key with more than an hour left, and a GitHub sign-in', async () => {
    const tools = fakeTools({ expiresAt: '2026-11-20T18:00:00Z' })
    const { out } = await call(['login', 'dev'], { tools })
    assert.ok(!lines(tools.calls, 'scw').some((line) => line.includes(' login ')))
    assert.match(out, /signed in as profile opos-land-dev until 2026-11-20T18:00:00Z/)
    assert.deepEqual(lines(tools.calls, 'gh'), ['auth status'])
  })

  it('signs in again for a key about to expire, one with no expiry or one it cannot read', async () => {
    for (const expiresAt of ['2026-11-20T12:30:00Z', '', null]) {
      const tools = fakeTools({ expiresAt })
      await call(['login', 'dev'], { tools })
      assert.ok(
        lines(tools.calls, 'scw').some((line) => line.includes(' login ')),
        String(expiresAt),
      )
    }
  })

  it('asks for one environment', async () => {
    await assert.rejects(call(['login']), /usage: pnpm deploy:login <environment>/)
  })

  it('stops when the sign-in fails', async () => {
    const tools = fakeTools({ accessKey: '', status: { 'scw -p opos-land-dev login': 1 } })
    await assert.rejects(call(['login', 'dev'], { tools }), /scw -p opos-land-dev login .* failed/)
  })
})

describe('bootstrap', () => {
  it('makes everything a new environment needs and writes the files project into env.yaml', async () => {
    const { tools, out, traced, files } = await call(['bootstrap', 'dev'])
    const { calls, world } = tools

    assert.deepEqual(scwChanges(calls), [
      'object bucket create',
      'secret secret create',
      'account project create',
      'domain external-domain register',
    ])
    assert.ok(
      lines(calls, 'scw').includes(
        `object bucket create opos-land-dev-tofu-state enable-versioning=true acl=private project-id=${PROJECT_ID} region=fr-par -o json`,
      ),
    )
    assert.ok(
      lines(calls, 'scw').some((line) => /^secret secret create .*protected=true/.test(line)),
    )
    // The passphrase reaches Secret Manager in a request's body, never as an argument
    assert.deepEqual(tools.requests, [
      {
        url: 'https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/passphrase-id/versions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'operator-secret' },
        body: { data: Buffer.from(PASSPHRASE).toString('base64'), disable_previous: false },
      },
    ])
    assert.ok(
      calls.every(
        ({ args, input }) => !args.some((arg) => arg.includes(PASSPHRASE)) && input === undefined,
      ),
    )
    assert.ok(
      traced.includes(
        '+ POST secret-manager/v1beta1/regions/fr-par/secrets/passphrase-id/versions',
      ),
    )
    assert.ok(
      lines(calls, 'scw').some((line) =>
        line.startsWith('account project create name=dev-opos-land-files '),
      ),
    )
    // With the administrator's own profile, never the operators'
    assert.ok(calls.every(({ env }) => env.SCW_PROFILE === undefined))

    assert.equal(setting(files[SETTINGS], 'files', 'project_id'), FILES_ID)
    assert.equal(world.versions, 1)
    assert.match(out, /_scaleway-challenge\.dev TXT the-token/)
    assert.match(out, /next: pnpm deploy:login dev, pnpm deploy:apply dev shared, then/)
    assert.match(out, /pnpm deploy:access:grant dev <email>\.\.\. for each operator/)
    assert.match(out, /files project: dev-opos-land-files, 2{8}-/)
    // Every change shows before it runs: each of scw, and the passphrase's request
    assert.equal(traced.length, scwChanges(calls).length + tools.requests.length)
    for (const line of traced) assert.match(line, /^\+ (scw |POST )/)
  })

  it('stops when Secret Manager refuses the passphrase, or the key to send it with is missing', async () => {
    await assert.rejects(
      call(['bootstrap', 'dev'], {
        tools: fakeTools({ http: { 'https://api.scaleway.com': 403 } }),
      }),
      /Secret Manager refused the state's passphrase \(403\)/,
    )
    const keyless = fakeTools({ status: { 'scw config get secret-key': 1 } })
    await assert.rejects(
      call(['bootstrap', 'dev'], { tools: keyless }),
      /scw config get secret-key failed/,
    )
    assert.deepEqual(keyless.requests, [])
  })

  it('changes nothing but the bucket versioning when everything is there', async () => {
    const tools = fakeTools({
      buckets: ['opos-land-dev-tofu-state'],
      secrets: [{ id: 'passphrase-id', name: 'tofu-state-passphrase' }],
      versions: 1,
      projects: [
        { id: 'other', name: 'dev-opos-land-files-old' },
        { id: FILES_ID, name: 'dev-opos-land-files' },
      ],
      domains: ['dev.opos.land'],
      validated: true,
    })
    const filled = withSetting(ENV_YAML, 'files', 'project_id', FILES_ID)
    const files = { [SETTINGS]: filled }
    const { out } = await call(['bootstrap', 'dev'], { tools, files })

    assert.deepEqual(scwChanges(tools.calls), ['object bucket update'])
    assert.equal(files[SETTINGS], filled)
    assert.match(out, /domain: dev\.opos\.land, active/)
    assert.match(out, /_scaleway-challenge\.dev TXT \n/)
  })

  it('writes the id of a files project made before into an env.yaml without it', async () => {
    const tools = fakeTools({ projects: [{ id: FILES_ID, name: 'dev-opos-land-files' }] })
    const { files } = await call(['bootstrap', 'dev'], { tools })
    assert.ok(!scwChanges(tools.calls).includes('account project create'))
    assert.equal(setting(files[SETTINGS], 'files', 'project_id'), FILES_ID)
  })

  it('stops when env.yaml names another files project than the one Scaleway holds', async () => {
    const tools = fakeTools({ projects: [{ id: FILES_ID, name: 'dev-opos-land-files' }] })
    const files = { [SETTINGS]: withSetting(ENV_YAML, 'files', 'project_id', 'another-id') }
    await assert.rejects(
      call(['bootstrap', 'dev'], { tools, files }),
      /files\.project_id is another-id, but dev-opos-land-files is 2{8}-/,
    )
  })

  it('stops on a failed listing instead of reading it as nothing', async () => {
    const tools = fakeTools({ status: { 'scw secret secret list': 1 } })
    await assert.rejects(call(['bootstrap', 'dev'], { tools }), /scw secret secret list .* failed/)
    assert.ok(!scwChanges(tools.calls).includes('secret secret create'))
  })

  it('stops for settings that name no zone or files project', async () => {
    for (const line of ['  zone: dev.opos.land', '  project: dev-opos-land-files']) {
      const tools = fakeTools()
      const files = { [SETTINGS]: ENV_YAML.replace(`${line}\n`, '') }
      await assert.rejects(
        call(['bootstrap', 'dev'], { tools, files }),
        /names no dns zone or no files project/,
      )
      assert.equal(tools.calls.length, 0)
    }
  })

  it('asks for one environment', async () => {
    await assert.rejects(call(['bootstrap']), /usage: pnpm deploy:bootstrap <environment>/)
    await assert.rejects(call(['bootstrap', 'dev', 'prod']), /usage: pnpm deploy:bootstrap/)
  })
})

describe('access', () => {
  it('puts people into the operators group', async () => {
    const { tools, out } = await call(['access:grant', 'dev', 'a@example.com', 'b@example.com'])
    assert.deepEqual(
      lines(tools.calls, 'scw').filter((line) => line.includes('add-members')),
      [
        'iam group add-members group-id=group-id user-ids.0=user-a -o json',
        'iam group add-members group-id=group-id user-ids.0=user-b -o json',
      ],
    )
    assert.match(out, /b@example\.com can run the deploy commands in opos-land-dev/)
  })

  it('takes out only the people who are in it', async () => {
    const { tools, out } = await call(['access:revoke', 'dev', 'a@example.com', 'b@example.com'])
    assert.deepEqual(scwChanges(tools.calls), ['iam group remove-member'])
    assert.ok(
      lines(tools.calls, 'scw').includes(
        'iam group remove-member group-id=group-id user-id=user-a -o json',
      ),
    )
    assert.match(out, /b@example\.com can no longer run the deploy commands in opos-land-dev/)
  })

  it('takes nobody out of a group with no members', async () => {
    const tools = fakeTools({ groups: [{ id: 'group-id', name: 'opos-land-dev-operators' }] })
    await call(['access:revoke', 'dev', 'a@example.com'], { tools })
    assert.deepEqual(scwChanges(tools.calls), [])
  })

  it('changes nobody when one of the people is not a member of the organisation', async () => {
    const tools = fakeTools()
    await assert.rejects(
      call(['access:grant', 'dev', 'a@example.com', 'c@example.com'], { tools }),
      /c@example\.com is not a member of the organisation/,
    )
    assert.deepEqual(scwChanges(tools.calls), [])
  })

  it('stops before the shared unit made the group', async () => {
    const tools = fakeTools({ groups: [] })
    await assert.rejects(
      call(['access:grant', 'dev', 'a@example.com'], { tools }),
      /no group opos-land-dev-operators: first pnpm deploy:apply dev shared/,
    )
  })

  it('asks for an environment and at least one person', async () => {
    await assert.rejects(
      call(['access:grant', 'dev']),
      /usage: pnpm deploy:access:grant <environment> <email>\.\.\./,
    )
    await assert.rejects(
      call(['access:revoke', 'dev']),
      /usage: pnpm deploy:access:revoke <environment> <email>\.\.\./,
    )
  })
})

describe('plan', () => {
  it('plans every unit but shared, or one, without the dependencies fetched from the state', async () => {
    const { tools } = await call(['plan', 'dev'])
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [
      `stack run --working-dir ${LIVE} --filter !shared -- plan`,
    ])
    const [terragrunt] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(terragrunt.env.TG_NO_DEPENDENCY_FETCH_OUTPUT_FROM_STATE, 'true')
    assert.equal(terragrunt.env.DEPLOY_REF, undefined)
    assert.equal(terragrunt.capture, false)

    const one = await call(['plan', 'dev', 'files', '--ref', 'feat/x'])
    const [unit] = one.tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(unit.args.join(' '), `stack run --working-dir ${LIVE} --filter files -- plan`)
    assert.equal(unit.env.DEPLOY_REF, 'feat/x')
  })

  it('keeps exact plans with --save', async () => {
    const { tools, out, removed } = await call(['plan', 'dev', '--save'])
    const [terragrunt] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(
      terragrunt.args.join(' '),
      `stack run --working-dir ${LIVE} --filter !shared --out-dir ${PLANS} -- plan`,
    )
    assert.equal(terragrunt.env.DEPLOY_EXACT_PLAN, 'true')
    assert.deepEqual(removed, [PLANS])
    assert.match(out, /pnpm deploy:apply dev --saved/)
  })

  it('says which units to apply first when an exact plan fails', async () => {
    const tools = fakeTools({ status: { 'terragrunt stack run': 1 } })
    await assert.rejects(
      call(['plan', 'dev', 'files', '--save'], { tools }),
      /apply them first by name/,
    )
  })

  it('passes on the status of a plan that fails', async () => {
    const tools = fakeTools({ status: { 'terragrunt stack run': 3 } })
    await assert.rejects(call(['plan', 'dev'], { tools }), (error) => error.exitCode === 3)
  })

  it('refuses a flag it does not know and a second unit', async () => {
    await assert.rejects(call(['plan', 'dev', '--force']), /Unknown option '--force'/)
    await assert.rejects(call(['plan', 'dev', 'files', 'mail']), /usage: pnpm deploy:plan/)
  })
})

describe("Supabase's access token", () => {
  const files = () => ({
    [SETTINGS]: `${ENV_YAML}\nsupabase:\n  ref: the-ref\n  token_secret: supabase-access-token\n`,
  })
  const tools = (state = {}) =>
    fakeTools({
      secrets: [{ id: 'supabase-token-id', name: 'supabase-access-token' }],
      stored: { 'supabase-token-id': 'the-supabase-token' },
      ...state,
    })
  const HEALTH = 'https://api.supabase.com/v1/projects/the-ref/health?services=auth'

  it('is tried before a plan or an apply that reaches the supabase unit', async () => {
    for (const args of [
      ['plan', 'dev'],
      ['plan', 'dev', 'supabase'],
      ['apply', 'dev', '--no-plan'],
    ]) {
      const fake = tools()
      await call(args, { tools: fake, files: files(), answers: ['y'] })
      assert.deepEqual(
        fake.requests.map(({ url, headers }) => [url, headers.Authorization]),
        [[HEALTH, 'Bearer the-supabase-token']],
        args.join(' '),
      )
      assert.ok(lines(fake.calls, 'terragrunt').length > 0, args.join(' '))
    }
    const other = tools()
    await call(['plan', 'dev', 'files'], { tools: other, files: files() })
    assert.deepEqual(other.requests, [])
  })

  it('stops before any plan when Supabase refuses the token or it holds no value', async () => {
    const refused = tools({ http: { 'https://api.supabase.com': 401 } })
    await assert.rejects(
      call(['apply', 'dev'], { tools: refused, files: files(), answers: ['y'] }),
      /the Supabase access token in supabase-access-token has lapsed or was revoked: make a new one \(infra\/SUPABASE\.md, The access token\) and store it with pnpm deploy:secret:set dev supabase-access-token/,
    )
    assert.deepEqual(lines(refused.calls, 'terragrunt'), [])

    const empty = tools({ status: { 'scw secret version access': 1 } })
    await assert.rejects(
      call(['plan', 'dev'], { tools: empty, files: files() }),
      /supabase-access-token holds no value: pnpm deploy:secret:set dev supabase-access-token/,
    )
    const unreachable = tools({ http: { 'https://api.supabase.com': 'unreachable' } })
    await assert.rejects(
      call(['plan', 'dev'], { tools: unreachable, files: files() }),
      /Supabase could not be reached to try the access token/,
    )
  })

  it('lets a token through that Supabase knows, whatever else it answers', async () => {
    const forbidden = tools({ http: { 'https://api.supabase.com': 403 } })
    await call(['plan', 'dev'], { tools: forbidden, files: files() })
    assert.ok(lines(forbidden.calls, 'terragrunt').length > 0)
  })
})

describe('apply', () => {
  it('plans one unit, asks once, then applies exactly that plan', async () => {
    const { tools, asked, removed } = await call(['apply', 'dev', 'files'], { answers: ['y'] })
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [
      `stack run --working-dir ${LIVE} --filter files --out-dir ${PLANS} -- plan`,
      `stack run --working-dir ${LIVE} --filter files --out-dir ${PLANS} -- apply`,
    ])
    const [, apply] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(apply.env.TG_NO_AUTO_APPROVE, 'true')
    assert.equal(apply.env.DEPLOY_EXACT_PLAN, undefined)
    assert.deepEqual(asked, [
      { question: 'Apply the plans above to dev (files)? [y/N] ', hidden: false },
    ])
    assert.deepEqual(removed, [PLANS, PLANS])
  })

  it('plans every unit, asks once and applies those plans when every unit plans', async () => {
    const { tools, asked } = await call(['apply', 'dev'], { answers: ['y'] })
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [
      `stack run --working-dir ${LIVE} --filter !shared --queue-ignore-errors --out-dir ${PLANS} -- plan`,
      `stack run --working-dir ${LIVE} --filter !shared --out-dir ${PLANS} -- apply`,
    ])
    assert.deepEqual(asked, [{ question: 'Apply the plans above to dev? [y/N] ', hidden: false }])
  })

  it('applies the units that planned, then plans and applies those that waited for them', async () => {
    const tools = fakeTools({
      rounds: [['secrets', 'cache', 'mail', 'files', 'supabase'], ['deployment'], ['github']],
    })
    const { asked, out } = await call(['apply', 'dev'], { tools, answers: ['y', 'y', 'y'] })
    const exact = `--queue-ignore-errors --out-dir ${PLANS} -- plan`
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [
      `stack run --working-dir ${LIVE} --filter !shared ${exact}`,
      `stack run --working-dir ${LIVE} --filter secrets --filter cache --filter mail --filter files --filter supabase --out-dir ${PLANS} -- apply`,
      `stack run --working-dir ${LIVE} --filter deployment --filter github ${exact}`,
      `stack run --working-dir ${LIVE} --filter deployment --out-dir ${PLANS} -- apply`,
      `stack run --working-dir ${LIVE} --filter github ${exact}`,
      `stack run --working-dir ${LIVE} --filter github --out-dir ${PLANS} -- apply`,
    ])
    assert.deepEqual(
      asked.map(({ question }) => question),
      [
        'Apply the plans above to dev (secrets, cache, mail, files, supabase)? [y/N] ',
        'Apply the plans above to dev (deployment)? [y/N] ',
        'Apply the plans above to dev (github)? [y/N] ',
      ],
    )
    assert.match(out, /Planned once those are applied: deployment, github/)
    assert.match(out, /Planned once those are applied: github/)
  })

  it('stops when a round plans no unit, and applies nothing more without a yes', async () => {
    const stuck = fakeTools({ rounds: [['secrets'], []] })
    await assert.rejects(
      call(['apply', 'dev'], { tools: stuck, answers: ['y'] }),
      /No unit planned: see the errors above\. A unit that reads shared plans once an administrator applied it: pnpm deploy:apply dev shared/,
    )
    assert.equal(
      lines(stuck.calls, 'terragrunt').filter((line) => line.endsWith('apply')).length,
      1,
    )

    const declined = fakeTools({ rounds: [['secrets'], ['deployment']] })
    await assert.rejects(
      call(['apply', 'dev'], { tools: declined, answers: ['y', 'n'] }),
      /Nothing applied/,
    )
    assert.equal(
      lines(declined.calls, 'terragrunt').filter((line) => line.endsWith('apply')).length,
      1,
    )
  })

  it('applies nothing without a yes', async () => {
    for (const answer of ['', 'n', 'no', 'Y es']) {
      const tools = fakeTools()
      await assert.rejects(call(['apply', 'dev'], { tools, answers: [answer] }), /Nothing applied/)
      assert.deepEqual(
        lines(tools.calls, 'terragrunt').filter((line) => line.endsWith('apply')),
        [],
        answer,
      )
    }
  })

  it('applies the kept plans with --saved, and only when there are some', async () => {
    const files = { [SETTINGS]: ENV_YAML, [PLANS]: '' }
    const { tools, asked } = await call(['apply', 'dev', '--saved'], { files, answers: ['yes'] })
    assert.deepEqual(lines(tools.calls, 'terragrunt'), [
      `stack run --working-dir ${LIVE} --filter !shared --out-dir ${PLANS} -- apply`,
    ])
    assert.equal(asked[0].question, 'Apply the plans above to dev? [y/N] ')

    await assert.rejects(
      call(['apply', 'dev', 'files', '--saved']),
      /No plans are kept: pnpm deploy:plan dev files --save first/,
    )
    await assert.rejects(call(['apply', 'dev', '--saved']), /pnpm deploy:plan dev --save first/)
  })

  it('applies unit by unit with --no-plan, after one answer', async () => {
    const { tools, asked } = await call(['apply', 'dev', '--no-plan', '--ref', 'v1'], {
      answers: ['Y'],
    })
    const [apply] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(apply.args.join(' '), `stack run --working-dir ${LIVE} --filter !shared -- apply`)
    assert.equal(apply.env.TG_NON_INTERACTIVE, 'true')
    assert.equal(apply.env.DEPLOY_REF, 'v1')
    assert.equal(asked[0].question, 'Apply dev with no plan shown first? [y/N] ')
  })

  it('takes --saved or --no-plan, not both', async () => {
    await assert.rejects(call(['apply', 'dev', '--saved', '--no-plan']), /usage: pnpm deploy:apply/)
  })
})

describe('destroy and output', () => {
  it('destroys one unit, one at a time and asking for it', async () => {
    const { tools } = await call(['destroy', 'dev', 'cache'])
    const [destroy] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.equal(
      destroy.args.join(' '),
      `stack run --working-dir ${LIVE} --filter cache -- destroy`,
    )
    assert.equal(destroy.env.TG_NO_AUTO_APPROVE, 'true')
    assert.equal(destroy.env.TG_PARALLELISM, '1')
    await assert.rejects(
      call(['destroy', 'dev']),
      /usage: pnpm deploy:destroy <environment> <unit>/,
    )
  })

  it('imports an object that exists into one unit, under its address', async () => {
    const address = 'coolify_environment_variable.this["OPOS_SEED"]'
    const { tools } = await call(['import', 'dev', 'deployment', address, 'application:app:env'])
    // Terragrunt refuses an import across a stack: the stack is generated, then the import runs in
    // the one unit's directory
    const [generated, imported] = tools.calls.filter(({ file }) => file === 'terragrunt')
    assert.deepEqual(generated.args, ['stack', 'generate', '--working-dir', LIVE])
    assert.deepEqual(imported.args, [
      'run',
      '--working-dir',
      `${LIVE}/.terragrunt-stack/deployment`,
      '--',
      'import',
      address,
      'application:app:env',
    ])
    assert.equal(imported.env.TG_NO_DEPENDENCY_FETCH_OUTPUT_FROM_STATE, 'true')
    await assert.rejects(
      call(['import', 'dev', 'deployment', address]),
      /usage: pnpm deploy:import <environment> <unit> <address> <id>/,
    )
    await assert.rejects(
      call(['import', 'dev', 'nowhere', address, 'application:app:env']),
      /dev has no unit nowhere/,
    )
  })

  it("prints every unit's outputs, or one's", async () => {
    assert.deepEqual(lines((await call(['output', 'dev'])).tools.calls, 'terragrunt'), [
      `stack output --working-dir ${LIVE}`,
    ])
    assert.deepEqual(lines((await call(['output', 'dev', 'files'])).tools.calls, 'terragrunt'), [
      `stack output --working-dir ${LIVE} files`,
    ])
    await assert.rejects(call(['output']), /usage: pnpm deploy:output <environment> \[unit\]/)
  })
})

describe('secret:set', () => {
  const secrets = [{ id: 'token-id', name: 'coolify-api-token' }]

  it("stores the value it reads without echo in the body of a request to Secret Manager's API alone", async () => {
    const tools = fakeTools({ secrets })
    const { asked, out, traced } = await call(['secret:set', 'dev', 'coolify-api-token'], {
      tools,
      answers: ['the-token-value'],
    })
    assert.deepEqual(asked, [{ question: 'The value of coolify-api-token: ', hidden: true }])
    // scw takes a value from a file alone, and Linux opens no socket, Node's input of a child, as one
    assert.deepEqual(tools.requests, [
      {
        url: 'https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/token-id/versions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'operator-secret' },
        body: { data: Buffer.from('the-token-value').toString('base64'), disable_previous: true },
      },
    ])
    assert.deepEqual(scwChanges(tools.calls), [])
    const key = tools.calls.find(({ args }) => args.join(' ') === 'config get secret-key')
    assert.equal(key.env.SCW_PROFILE, 'opos-land-dev')
    assert.ok(
      tools.calls.every(
        ({ args, input }) =>
          !args.some((arg) => arg.includes('the-token-value')) && input === undefined,
      ),
    )
    assert.deepEqual(traced, [
      '+ POST secret-manager/v1beta1/regions/fr-par/secrets/token-id/versions disable_previous',
    ])
    assert.match(out, /coolify-api-token has a new value; apply the units that read it/)
  })

  it('stops when Secret Manager refuses the version', async () => {
    const tools = fakeTools({ secrets, http: { 'https://api.scaleway.com': 403 } })
    await assert.rejects(
      call(['secret:set', 'dev', 'coolify-api-token'], { tools, answers: ['the-token-value'] }),
      /Secret Manager refused a new version of coolify-api-token \(403\)/,
    )
  })

  it('changes nothing for an empty value or a secret the project lacks', async () => {
    const tools = fakeTools({ secrets })
    await assert.rejects(
      call(['secret:set', 'dev', 'coolify-api-token'], { tools }),
      /nothing entered/,
    )
    await assert.rejects(
      call(['secret:set', 'dev', 'missing'], { tools }),
      /the project has no secret missing: apply the environment's secrets unit first/,
    )
    assert.deepEqual(scwChanges(tools.calls), [])
    await assert.rejects(
      call(['secret:set', 'dev']),
      /usage: pnpm deploy:secret:set <environment> <name>/,
    )
  })
})

describe('secret:get', () => {
  const tools = () =>
    fakeTools({
      secrets: [{ id: 'auth-id', name: 'basic-auth-password' }],
      stored: { 'auth-id': 'the-password' },
    })

  it('prints exactly the value, with a line break on a terminal alone', async () => {
    const { written } = await call(['secret:get', 'dev', 'basic-auth-password'], { tools: tools() })
    assert.equal(written, 'the-password')

    const terminal = []
    const fake = tools()
    await deploy({
      args: ['secret:get', 'dev', 'basic-auth-password'],
      root: ROOT,
      env: { HOME: '/home/op' },
      fs: { exists: () => true, read: () => ENV_YAML },
      run: fake.run,
      write: (text) => terminal.push(text),
      isTTY: true,
    })
    assert.equal(terminal.join(''), 'the-password\n')
    assert.ok(
      lines(fake.calls, 'scw').includes(
        'secret version access secret-id=auth-id revision=latest_enabled region=fr-par -o json',
      ),
    )
  })

  it('stops for a secret the project lacks', async () => {
    await assert.rejects(
      call(['secret:get', 'dev', 'missing'], { tools: tools() }),
      /the project has no secret missing/,
    )
    await assert.rejects(
      call(['secret:get', 'dev']),
      /usage: pnpm deploy:secret:get <environment> <name>/,
    )
  })
})

describe('state-passphrase', () => {
  const header = '{"magic":"OpenTofu-External-Key-Provider","version":1}\n'
  const passphrase = Buffer.from('the passphrase').toString('base64')

  it('hands over the passphrase as both keys when OpenTofu decrypts', async () => {
    const tools = fakeTools({ passphrase })
    const written = []
    await deploy({
      args: ['state-passphrase', PROJECT_ID, 'fr-par', '1'],
      env: { SCW_PROFILE: 'opos-land-dev' },
      run: tools.run,
      stdin: () => '{"external_data":{}}',
      write: (text) => written.push(text),
    })
    assert.equal(written[0], header)
    assert.deepEqual(JSON.parse(written[1]), {
      keys: { encryption_key: passphrase, decryption_key: passphrase },
      meta: { external_data: {} },
    })
    assert.equal(
      lines(tools.calls, 'scw')[0],
      `secret version access-by-path secret-path=/ secret-name=tofu-state-passphrase revision=1 project-id=${PROJECT_ID} region=fr-par -o json`,
    )
    assert.equal(tools.calls[0].env.SCW_PROFILE, 'opos-land-dev')
  })

  it('hands over no decryption key when OpenTofu only encrypts', async () => {
    const { written } = await call(['state-passphrase', PROJECT_ID, 'fr-par', '1'], {
      tools: fakeTools({ passphrase }),
    })
    assert.deepEqual(JSON.parse(written.slice(header.length)).keys, { encryption_key: passphrase })
  })

  it('stops when the secret holds no value, or is asked without its three arguments', async () => {
    await assert.rejects(call(['state-passphrase', PROJECT_ID, 'fr-par', '1']), /no passphrase/)
    await assert.rejects(
      call(['state-passphrase', PROJECT_ID]),
      /usage: .*state-passphrase <project-id> <region> <revision>/,
    )
  })
})

describe('nodeRun', () => {
  it('returns the status and the output of the command, fed its input', () => {
    const result = nodeRun(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
      input: 'fed',
    })
    assert.deepEqual(result, { status: 0, stdout: 'fed' })
    assert.equal(nodeRun(process.execPath, ['-e', 'process.exit(3)']).status, 3)
  })

  it('leaves the terminal to a command that does not capture, and passes on its environment', () => {
    const result = nodeRun(
      process.execPath,
      ['-e', 'process.exit(process.env.OPOS_TEST === "1" ? 0 : 1)'],
      {
        capture: false,
        env: { ...process.env, OPOS_TEST: '1' },
      },
    )
    assert.deepEqual(result, { status: 0, stdout: '' })
  })

  it('says to run through mise when a tool is missing', () => {
    assert.throws(
      () => nodeRun('opos-no-such-tool', ['info']),
      /opos-no-such-tool could not run .*through mise/,
    )
  })
})

describe('nodeAsk', () => {
  it('reads an answer', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const answer = nodeAsk('Apply? ', { input, output })
    input.write('yes\n')
    assert.equal(await answer, 'yes')
  })

  it('shows the question but not what is typed when hidden', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    let shown = ''
    output.on('data', (chunk) => (shown += chunk))
    const answer = nodeAsk('The value: ', { hidden: true, input, output })
    input.write('secret-value\n')
    assert.equal(await answer, 'secret-value')
    assert.match(shown, /The value: /)
    assert.doesNotMatch(shown, /secret-value/)
  })
})

describe('nodeFs', () => {
  it('reads, writes and removes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opos-deploy-'))
    try {
      const path = join(dir, 'env.yaml')
      assert.equal(nodeFs.exists(path), false)
      nodeFs.write(path, ENV_YAML)
      assert.equal(nodeFs.read(path), ENV_YAML)
      nodeFs.remove(path)
      assert.equal(nodeFs.exists(path), false)
      nodeFs.remove(path)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('newPassphrase', () => {
  it('makes 64 characters, a new value each time', () => {
    assert.match(newPassphrase(), /^[A-Za-z0-9+/]{64}$/)
    assert.notEqual(newPassphrase(), newPassphrase())
  })
})
