#!/usr/bin/env node
// The deploy commands, `pnpm deploy:<command>` (docs/specs/0015-deployment.md,
// docs/adr/0070-run-the-deploy-commands-as-node-scripts.md). An environment is a directory of
// infra/live, whose env.yaml holds its settings and whose terragrunt.stack.hcl its units. The
// tools, OpenTofu, Terragrunt, scw and gh, come from mise.
//
// An administrator of the Scaleway organisation runs bootstrap and grant with their own profile of
// scw. Every other command runs under the operator's own key: the profile of scw named after the
// environment's project, which `login` signs in, kept in a config file of the deploy commands' own
// so that the top-level settings of the person's own config.yaml never merge into it. OpenTofu's s3
// backend speaks AWS's names, so the same key reaches it as AWS_* variables, for the run alone.
//
// state-passphrase is no command of a person's: it is OpenTofu's external key provider for the
// state (infra/root.hcl), run by OpenTofu under the operator's key.

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Who may run a command is its help's to say; the task list says only what it does
// (docs/adr/0079-name-the-root-commands-by-what-they-act-on.md).
const OPERATOR = 'Run by an operator, under their own key; never by an agent.'
const ADMINISTRATOR =
  'Run by an administrator of the Scaleway organisation, under their own key; never by an agent.'

/** Each command's arguments and help: what --help prints, and the usage a wrong call is told. */
const HELP = {
  login: {
    synopsis: '<environment>',
    about:
      'Signs you in to Scaleway and GitHub as yourself for the deploy commands of an environment, unless you already are. The Scaleway key lasts 12 hours.',
    who: 'Run by an operator or an administrator, as themselves.',
  },
  bootstrap: {
    synopsis: '<environment>',
    about:
      "Once per environment: makes the state's bucket and its passphrase and the project of the bucket of uploaded files, and registers the environment's domain. Safe to run again.",
    who: ADMINISTRATOR,
  },
  'access:grant': {
    synopsis: '<environment> <email>...',
    about:
      "Lets people run the deploy commands of an environment: puts them into its operators' group, which the shared unit makes. Each person is a member of the organisation. Safe to run again.",
    who: ADMINISTRATOR,
  },
  'access:revoke': {
    synopsis: '<environment> <email>...',
    about:
      "Stops people from running the deploy commands of an environment: takes them out of its operators' group.",
    who: ADMINISTRATOR,
  },
  plan: {
    synopsis: '<environment> [unit] [--save] [--ref <ref>]',
    about:
      'Shows what applying an environment would change: every unit but shared, in the order of their dependencies, or the one unit named.',
    flags: [
      ['--save', 'plans as an apply does and keeps the plans for pnpm deploy:apply --saved'],
      ['--ref <ref>', 'plans another branch or tag than env.yaml names'],
    ],
    who: 'Run by an operator, under their own key.',
  },
  apply: {
    synopsis: '<environment> [unit] [--saved | --no-plan] [--ref <ref>]',
    about:
      'Plans an environment, asks once, then applies exactly those plans, in rounds while units wait for others to be applied: every unit but shared, or the one unit named. shared is applied by an administrator, and only by its name.',
    flags: [
      ['--saved', 'applies the plans of pnpm deploy:plan --save'],
      ['--no-plan', 'applies in order without showing a plan, after one question: a first setup'],
      [
        '--ref <ref>',
        'deploys another branch or tag than env.yaml names, until an apply without it',
      ],
    ],
    who: OPERATOR,
  },
  destroy: {
    synopsis: '<environment> <unit>',
    about: 'Destroys one unit of an environment, after showing its plan and asking.',
    who: OPERATOR,
  },
  import: {
    synopsis: '<environment> <unit> <address> <id>',
    about:
      "A repair: takes an object that exists but no state holds into one unit's state under its address, such as a variable Coolify made from the compose file's default before the unit wrote it.",
    who: OPERATOR,
  },
  output: {
    synopsis: '<environment> [unit]',
    about: "Prints the outputs of an environment's units, or of the one unit named.",
    who: 'Run by an operator, under their own key.',
  },
  'secret:set': {
    synopsis: '<environment> <name>',
    about:
      'Stores a new value of a secret a third party issued, read without echo, and disables the version before it. Apply the units that read it afterwards.',
    who: OPERATOR,
  },
  'secret:get': {
    synopsis: '<environment> <name>',
    about:
      "Prints the current value of one of an environment's secrets, and only it, for a password manager or the clipboard.",
    who: OPERATOR,
  },
}
const COMMANDS = [...Object.keys(HELP), 'state-passphrase'].join(', ')
const isHelp = (arg) => arg === '--help' || arg === '-h'

/** `text` in lines of at most 100 columns, broken between words. */
const wrap = (text) =>
  text.split(' ').reduce((lines, word) => {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= 100)
      lines[lines.length - 1] += ` ${word}`
    else lines.push(word)
    return lines
  }, [])

/** What --help prints for a command, or for all of them without one. */
function helpOf(command) {
  if (!command) {
    return [
      'usage: pnpm deploy:<command> [arguments], or with --help for one command',
      '',
      ...Object.entries(HELP).map(([name, { synopsis }]) => `  pnpm deploy:${name} ${synopsis}`),
    ].join('\n')
  }
  const { synopsis, about, flags = [], who } = HELP[command]
  const width = Math.max(...flags.map(([flag]) => flag.length))
  return [
    `usage: pnpm deploy:${command} ${synopsis}`,
    '',
    ...wrap(about),
    ...(flags.length > 0
      ? ['', ...flags.map(([flag, line]) => `  ${flag.padEnd(width)}  ${line}`)]
      : []),
    '',
    who,
  ].join('\n')
}

/** An error that names its exit status: 2 for a usage, a tool's own status for its failure. */
const failure = (message, exitCode = 1) => Object.assign(new Error(message), { exitCode })
const usage = (line) => failure(`usage: ${line}`, 2)

/** The lines of a top-level block of env.yaml, with their index, up to the next top-level key. */
function blockLines(text, block) {
  const lines = text.split('\n')
  const start = lines.indexOf(`${block}:`)
  if (start === -1) return { lines, inside: [] }
  const inside = []
  for (let index = start + 1; index < lines.length && !/^[^ #]/.test(lines[index]); index++) {
    inside.push(index)
  }
  return { lines, inside }
}

const KEY = (key) => new RegExp(`^ {2}${key}:(?:\\s+(\\S+))?\\s*$`)

/** A plain value one level inside a top-level block of env.yaml; empty when it has none. */
export function setting(text, block, key) {
  const { lines, inside } = blockLines(text, block)
  for (const index of inside) {
    const match = KEY(key).exec(lines[index])
    if (match) return match[1] ?? ''
  }
  return ''
}

/** `text` with the key of a block given `value`, the rest of env.yaml as it was. */
export function withSetting(text, block, key, value) {
  const { lines, inside } = blockLines(text, block)
  const index = inside.find((candidate) => KEY(key).test(lines[candidate]))
  if (index === undefined) throw new Error(`env.yaml holds no ${block}.${key}`)
  lines[index] = `  ${key}: ${value}`
  return lines.join('\n')
}

export const nodeFs = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
  write: (path, text) => writeFileSync(path, text),
  remove: (path) => rmSync(path, { recursive: true, force: true }),
}

/**
 * Runs a tool and returns its status and what it printed. A captured tool prints to this script;
 * one that does not, such as Terragrunt or a sign-in, has the terminal. Its errors always reach
 * the terminal; `input` goes to its standard input, the one way a secret reaches it.
 */
export function nodeRun(file, args, { env = process.env, input, capture = true } = {}) {
  const result = spawnSync(file, args, {
    env,
    input,
    encoding: 'utf8',
    stdio: [
      input === undefined ? (capture ? 'ignore' : 'inherit') : 'pipe',
      capture ? 'pipe' : 'inherit',
      'inherit',
    ],
  })
  if (result.error) {
    throw failure(
      `${file} could not run (${result.error.code}): run the deploy commands through mise, as mise run deploy:<command>`,
    )
  }
  return { status: result.status, stdout: result.stdout ?? '' }
}

/** Asks a question on the terminal; a hidden answer is not shown as it is typed. */
export function nodeAsk(
  question,
  { hidden = false, input = process.stdin, output = process.stderr } = {},
) {
  return new Promise((resolve) => {
    const reader = createInterface({ input, output, terminal: true })
    if (hidden) {
      // The question alone reaches the terminal, never a character of the answer
      reader._writeToOutput = (text) => {
        if (text.includes(question)) output.write(question)
      }
    }
    reader.question(question, (answer) => {
      reader.close()
      if (hidden) output.write('\n')
      resolve(answer)
    })
  })
}

/** 64 random characters for the state's passphrase. */
export const newPassphrase = () => randomBytes(48).toString('base64')

/**
 * Runs `args`, a command and its arguments. `run(file, args, { env, input, capture })` returns
 * `{ status, stdout }`; `request` is `fetch`, for Secret Manager's and Supabase's APIs;
 * `ask(question, { hidden })` an answer; `fs` has `exists`, `read`, `write` and `remove`; `trace`
 * shows a change before it runs, `log` what was made, `write` what a command prints as its output
 * alone.
 */
export async function deploy({
  args = process.argv.slice(2),
  root = ROOT,
  env = process.env,
  fs = nodeFs,
  run = nodeRun,
  /* node:coverage ignore next */
  request = (url, options) => fetch(url, options),
  ask = nodeAsk,
  random = newPassphrase,
  now = Date.now,
  /* node:coverage ignore next 2 */
  stdin = () => readFileSync(0, 'utf8'),
  write = (text) => process.stdout.write(text),
  isTTY = process.stdout.isTTY,
  log = console.log,
  trace = console.error,
} = {}) {
  const [command, ...rest] = args
  if (isHelp(command)) return log(helpOf())
  if (Object.hasOwn(HELP, command ?? '') && rest.some(isHelp)) return log(helpOf(command))
  /** The usage of this command, from its help. */
  const misuse = () => usage(`pnpm deploy:${command} ${HELP[command].synopsis}`)
  // The tools as given, for where a helper of a command takes the name run
  const runTool = run

  /** The settings of an environment; it stops for one that has none. */
  function environment(name) {
    const path = join(root, 'infra/live', name, 'env.yaml')
    if (!fs.exists(path))
      throw failure(`no environment has its settings at ${relative(root, path)}`, 2)
    const text = fs.read(path)
    const settings = {
      name,
      path,
      live: dirname(path),
      text,
      get: (block, key) => setting(text, block, key),
    }
    settings.project = settings.get('scaleway', 'project')
    settings.projectId = settings.get('scaleway', 'project_id')
    settings.region = settings.get('scaleway', 'region')
    if (!settings.project || !settings.projectId || !settings.region) {
      throw failure(`${relative(root, path)} names no scaleway project, project_id and region`, 2)
    }
    return settings
  }

  /** scw, under `vars`: what it printed as JSON; a failure stops the command. */
  const scw = (vars) => {
    const read = (words, input) => {
      const { status, stdout } = run('scw', [...words, '-o', 'json'], { env: vars, input })
      if (status !== 0) throw failure(`scw ${words.join(' ')} failed`, status)
      return JSON.parse(stdout)
    }
    // Shows a change before it runs; no secret is ever an argument
    const change = (words, input) => {
      trace(`+ scw ${words.join(' ')}`)
      return read(words, input)
    }
    // A new version of a secret, its value in the body of a request to Secret Manager's API with
    // the profile's own key: scw takes a value from a file alone, and Node hands a child its input
    // on a socket, which Linux does not open as /dev/stdin
    const store = async (secretId, region, value, { disablePrevious }) => {
      const key = run('scw', ['config', 'get', 'secret-key'], { env: vars })
      if (key.status !== 0) throw failure('scw config get secret-key failed', key.status)
      const path = `secret-manager/v1beta1/regions/${region}/secrets/${secretId}/versions`
      trace(`+ POST ${path}${disablePrevious ? ' disable_previous' : ''}`)
      return request(`https://api.scaleway.com/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': key.stdout.trim() },
        body: JSON.stringify({
          data: Buffer.from(value).toString('base64'),
          disable_previous: disablePrevious,
        }),
      })
    }
    return { read, change, store }
  }

  /**
   * Stops before a plan or an apply reaches the supabase unit when Supabase no longer knows the
   * access token it reads (infra/SUPABASE.md, The access token): the token lasts days, and its
   * provider fails only midway through a run. Any answer but 401 lets the run go on; the token is
   * read for this request alone.
   */
  async function trySupabaseToken(settings, vars) {
    const ref = settings.get('supabase', 'ref')
    const secret = settings.get('supabase', 'token_secret')
    if (!ref || !secret) return
    const enter = `pnpm deploy:secret:set ${settings.name} ${secret}`
    const tool = scw(vars)
    const id = secretId(settings, tool, secret)
    let token
    try {
      const { data } = tool.read([
        'secret',
        'version',
        'access',
        `secret-id=${id}`,
        'revision=latest_enabled',
        `region=${settings.region}`,
      ])
      token = Buffer.from(data, 'base64').toString()
    } catch {
      throw failure(`${secret} holds no value: ${enter}`)
    }
    let response
    try {
      response = await request(`https://api.supabase.com/v1/projects/${ref}/health?services=auth`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (error) {
      throw failure(`Supabase could not be reached to try the access token: ${error.message}`)
    }
    if (response.status === 401) {
      throw failure(
        `the Supabase access token in ${secret} has lapsed or was revoked: make a new one (infra/SUPABASE.md, The access token) and store it with ${enter}`,
      )
    }
  }

  /** A tool that has the terminal; its failure stops the command with its status. */
  const interactive = (file, words, vars) => {
    const { status } = run(file, words, { env: vars, capture: false })
    if (status !== 0) throw failure(`${file} ${words.join(' ')} failed`, status)
  }

  /** The variables of a run under the operator's own key; signed out, the profile alone. */
  function operator(settings, { signedOut = false } = {}) {
    const vars = {
      ...env,
      SCW_PROFILE: settings.project,
      SCW_CONFIG_PATH: join(
        env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'),
        'scw',
        'opos-deploy.yaml',
      ),
    }
    if (signedOut) return vars
    const accessKey = run('scw', ['config', 'get', 'access-key'], { env: vars })
    if (accessKey.status !== 0 || accessKey.stdout.trim() === '') {
      throw failure(
        `scw has no profile ${settings.project}: pnpm deploy:login ${settings.name} first`,
      )
    }
    const secretKey = run('scw', ['config', 'get', 'secret-key'], { env: vars })
    return {
      ...vars,
      AWS_ACCESS_KEY_ID: accessKey.stdout.trim(),
      AWS_SECRET_ACCESS_KEY: secretKey.stdout.trim(),
    }
  }

  /** The id of a secret of the environment's project, by its name. */
  const secretId = (settings, tool, name) =>
    tool.read([
      'secret',
      'secret',
      'list',
      `name=${name}`,
      `project-id=${settings.projectId}`,
      `region=${settings.region}`,
    ])[0]?.id

  const commands = {
    // Signs the operator in, each unless already signed in: to Scaleway through the browser, with a
    // key that belongs to the environment's project and expires after 12 hours; to GitHub through
    // its CLI. Nothing is written to the repository.
    async login() {
      if (rest.length !== 1) throw misuse()
      const settings = environment(rest[0])
      const vars = operator(settings, { signedOut: true })
      const profile = ['-p', settings.project]

      // The profile's key stands while it has more than an hour left; every user may read their
      // own keys
      let expires = ''
      const accessKey = run('scw', ['config', 'get', 'access-key'], { env: vars })
      if (accessKey.status === 0 && accessKey.stdout.trim()) {
        const key = run(
          'scw',
          [
            ...profile,
            'iam',
            'api-key',
            'get',
            accessKey.stdout.trim(),
            'with-policies=false',
            '-o',
            'json',
          ],
          { env: vars },
        )
        const expiresAt = key.status === 0 ? JSON.parse(key.stdout).expires_at : ''
        if (expiresAt && Date.parse(expiresAt) - now() > 3600e3) expires = expiresAt
      }
      if (expires) {
        log(`Scaleway: signed in as profile ${settings.project} until ${expires}`)
      } else {
        interactive(
          'scw',
          [...profile, 'login', `project-id=${settings.projectId}`, 'expires-at=+12h'],
          vars,
        )
      }
      // The profile holds the key alone: the project and region come from env.yaml on every run
      for (const key of ['default-project-id', 'default-region']) {
        run('scw', [...profile, 'config', 'unset', key], { env: vars })
      }

      if (run('gh', ['auth', 'status'], { env: vars }).status !== 0) {
        interactive('gh', ['auth', 'login'], vars)
      }
    },

    // What an environment needs before its first plan and no unit can make, made once by an
    // administrator of its Scaleway organisation, with their own profile
    // (docs/adr/0035-describe-the-infrastructure-in-opentofu-units-run-by-terragrunt.md): the
    // bucket that holds the state and the passphrase its key derives from, which the state of a unit
    // that made them would need; the project that holds the bucket of uploaded files alone, whose id
    // goes into env.yaml
    // (docs/adr/0069-keep-an-environments-uploaded-files-in-a-scaleway-project-of-their-own.md); and
    // the environment's domain, for which no resource exists. Safe to run again, also to print the
    // DNS records again.
    async bootstrap() {
      if (rest.length !== 1) throw misuse()
      const settings = environment(rest[0])
      const { project, projectId, region } = settings
      const zone = settings.get('dns', 'zone')
      const filesProject = settings.get('files', 'project')
      if (!zone || !filesProject) {
        throw failure(`${relative(root, settings.path)} names no dns zone or no files project`, 2)
      }
      const { read, change, store } = scw(env)
      const inProject = [`project-id=${projectId}`, `region=${region}`]

      // The names infra/root.hcl and the state's key provider derive from the project. The bucket
      // keeps every earlier version of every object: a damaged state is restored from one.
      const bucket = `${project}-tofu-state`
      if (run('scw', ['object', 'bucket', 'get', bucket, ...inProject], { env }).status === 0) {
        change(['object', 'bucket', 'update', bucket, 'enable-versioning=true', ...inProject])
      } else {
        change([
          'object',
          'bucket',
          'create',
          bucket,
          'enable-versioning=true',
          'acl=private',
          ...inProject,
        ])
      }
      log(`state bucket: ${bucket}`)

      // 64 random characters, made here and sent on scw's standard input; protected, so that it
      // cannot be deleted. Losing it loses every state.
      const passphrase = 'tofu-state-passphrase'
      const passphraseId =
        read(['secret', 'secret', 'list', `name=${passphrase}`, 'path=/', ...inProject])[0]?.id ??
        change([
          'secret',
          'secret',
          'create',
          `name=${passphrase}`,
          'path=/',
          'protected=true',
          ...inProject,
          'description=The passphrase the key of the OpenTofu state derives from',
        ]).id
      // Only the first version: a second one would change the passphrase and lose every state
      if (
        read(['secret', 'version', 'list', `secret-id=${passphraseId}`, `region=${region}`])
          .length === 0
      ) {
        const response = await store(passphraseId, region, random(), { disablePrevious: false })
        if (!response.ok) {
          throw failure(`Secret Manager refused the state's passphrase (${response.status})`)
        }
      }
      log(`state passphrase: ${passphrase}`)

      // The project of the bucket of uploaded files, found by its name; the units read its id from
      // env.yaml, which this writes once and checks after
      const filesProjectId =
        read(['account', 'project', 'list', `name=${filesProject}`]).find(
          (candidate) => candidate.name === filesProject,
        )?.id ??
        change([
          'account',
          'project',
          'create',
          `name=${filesProject}`,
          `description=The bucket of uploaded files of the ${project} project, alone`,
        ]).id
      const written = settings.get('files', 'project_id')
      if (!written) {
        fs.write(settings.path, withSetting(settings.text, 'files', 'project_id', filesProjectId))
        log(`${relative(root, settings.path)}: files.project_id written; commit it`)
      } else if (written !== filesProjectId) {
        throw failure(
          `${relative(root, settings.path)}: files.project_id is ${written}, but ${filesProject} is ${filesProjectId}`,
        )
      }
      log(`files project: ${filesProject}, ${filesProjectId}`)

      // The environment's domain, held as an external domain: Scaleway makes its zone, which the
      // parent zone delegates, and removes the domain unless the TXT record proves it within 48
      // hours and the NS records point at its name servers within 14 days. A listing, not a get: a
      // failure stops the bootstrap instead of reading as "not registered".
      const registered = read([
        'domain',
        'domain',
        'list',
        `domain=${zone}`,
        `project-id=${projectId}`,
      ]).some((domain) => domain.domain === zone)
      if (!registered) {
        change([
          'domain',
          'external-domain',
          'register',
          `domain=${zone}`,
          `project-id=${projectId}`,
        ])
      }
      const domain = read(['domain', 'domain', 'get', `domain=${zone}`])
      const token = domain.external_domain_registration_status?.validation_token ?? ''
      const label = zone.split('.')[0]
      log(`domain: ${zone}, ${domain.status}`)
      log(
        `records in the zone of ${zone.slice(label.length + 1)}: the TXT first, the NS once Scaleway has validated it`,
      )
      log(`  _scaleway-challenge.${label} TXT ${token}`)
      log(`  ${label} NS ns0.dom.scw.cloud`)
      log(`  ${label} NS ns1.dom.scw.cloud`)
      log(
        `next: pnpm deploy:login ${settings.name}, pnpm deploy:apply ${settings.name} shared, then`,
      )
      log(`pnpm deploy:access:grant ${settings.name} <email>... for each operator`)
    },

    'access:grant': () => access('grant'),
    'access:revoke': () => access('revoke'),

    plan: () => stack('plan'),
    apply: () => stack('apply'),

    // Destroys one unit, after showing its plan and asking, one unit at a time
    async destroy() {
      if (rest.length !== 2) throw misuse()
      const settings = environment(rest[0])
      interactive(
        'terragrunt',
        ['stack', 'run', '--working-dir', settings.live, '--filter', rest[1], '--', 'destroy'],
        {
          ...operator(settings),
          TG_NO_DEPENDENCY_FETCH_OUTPUT_FROM_STATE: 'true',
          TG_NO_AUTO_APPROVE: 'true',
          TG_PARALLELISM: '1',
        },
      )
    },

    // Takes an object that exists, but that no state holds, into one unit's state under the
    // address the unit's code gives it: a variable Coolify made from the compose file's default
    // before the unit wrote it, which the unit then fails to create. The next apply plans the rest.
    // Terragrunt refuses an import across a stack, so it runs in the generated unit's directory.
    async import() {
      if (rest.length !== 4) {
        throw misuse()
      }
      const [name, unit, address, id] = rest
      const settings = environment(name)
      const units = [
        ...fs.read(join(settings.live, 'terragrunt.stack.hcl')).matchAll(/^unit "([^"]+)"/gm),
      ].map(([, one]) => one)
      if (!units.includes(unit)) throw failure(`${name} has no unit ${unit}`, 2)
      const vars = { ...operator(settings), TG_NO_DEPENDENCY_FETCH_OUTPUT_FROM_STATE: 'true' }
      interactive('terragrunt', ['stack', 'generate', '--working-dir', settings.live], vars)
      interactive(
        'terragrunt',
        [
          'run',
          '--working-dir',
          join(settings.live, '.terragrunt-stack', unit),
          '--',
          'import',
          address,
          id,
        ],
        vars,
      )
    },

    async output() {
      if (rest.length < 1 || rest.length > 2) throw misuse()
      const settings = environment(rest[0])
      interactive(
        'terragrunt',
        ['stack', 'output', '--working-dir', settings.live, ...rest.slice(1)],
        operator(settings),
      )
    },

    // Stores a new value of a secret whose value a person enters, read without echo and sent to
    // Secret Manager in a request's body: never an argument, a file or the shell's history. The
    // version before it is disabled.
    async 'secret:set'() {
      if (rest.length !== 2) throw misuse()
      const [name, secret] = rest
      const settings = environment(name)
      const tool = scw(operator(settings))
      const id = secretId(settings, tool, secret)
      if (!id)
        throw failure(
          `the project has no secret ${secret}: apply the environment's secrets unit first`,
        )
      const value = await ask(`The value of ${secret}: `, { hidden: true })
      if (!value) throw failure(`nothing entered; ${secret} is unchanged`)
      const response = await tool.store(id, settings.region, value, { disablePrevious: true })
      if (!response.ok) {
        throw failure(`Secret Manager refused a new version of ${secret} (${response.status})`)
      }
      log(`${secret} has a new value; apply the units that read it`)
    },

    // Prints the current value of a secret, entered or generated: exactly the value, so that it
    // pipes into a password manager or the clipboard, and a line break after it only on a
    // terminal. It changes nothing.
    async 'secret:get'() {
      if (rest.length !== 2) throw misuse()
      const [name, secret] = rest
      const settings = environment(name)
      const tool = scw(operator(settings))
      const id = secretId(settings, tool, secret)
      if (!id) throw failure(`the project has no secret ${secret}`)
      // Secret Manager hands out the value in base64
      const { data } = tool.read([
        'secret',
        'version',
        'access',
        `secret-id=${id}`,
        'revision=latest_enabled',
        `region=${settings.region}`,
      ])
      write(Buffer.from(data, 'base64').toString())
      if (isTTY) write('\n')
    },

    // OpenTofu's external key provider: a header, then the stored metadata on its input, then the
    // keys on its output, nothing else. "null" metadata means OpenTofu only encrypts; then no
    // decryption key is handed back. Secret Manager hands out the passphrase in base64, the form the
    // protocol wants it in.
    async 'state-passphrase'() {
      if (rest.length !== 3) {
        throw usage('node scripts/deploy.mjs state-passphrase <project-id> <region> <revision>')
      }
      const [projectId, region, revision] = rest
      write('{"magic":"OpenTofu-External-Key-Provider","version":1}\n')
      const meta = stdin().trim()
      const { data } = scw(env).read([
        'secret',
        'version',
        'access-by-path',
        'secret-path=/',
        'secret-name=tofu-state-passphrase',
        `revision=${revision}`,
        `project-id=${projectId}`,
        `region=${region}`,
      ])
      if (!data) throw failure('the state has no passphrase')
      const keys = { encryption_key: data }
      if (meta !== 'null') keys.decryption_key = data
      write(JSON.stringify({ keys, meta: { external_data: {} } }))
    },
  }

  // Lets people run the deploy commands of an environment, or stops them: puts them into its
  // operators' group or takes them out of it. The shared unit makes the group and leaves its
  // members alone, so that who they are stays out of the repository. Run by an administrator, with
  // their own profile; each person is a member of the organisation. Safe to run again.
  function access(way) {
    const { positionals } = parseArgs({ args: rest, allowPositionals: true })
    if (positionals.length < 2) throw misuse()
    const [name, ...emails] = positionals
    const settings = environment(name)
    const { read, change } = scw(env)

    // The name the shared unit gives the group
    const groupName = `${settings.project}-operators`
    const group = read(['iam', 'group', 'list', `name=${groupName}`]).find(
      (candidate) => candidate.name === groupName,
    )
    if (!group) throw failure(`no group ${groupName}: first pnpm deploy:apply ${name} shared`)

    // Every person is found before anyone changes
    const users = read(['iam', 'user', 'list'])
    const people = emails.map((email) => {
      const user = users.find((candidate) => candidate.email === email)
      if (!user) throw failure(`${email} is not a member of the organisation`)
      return { email, id: user.id }
    })
    for (const { email, id } of people) {
      if (way === 'revoke') {
        if ((group.user_ids ?? []).includes(id)) {
          change(['iam', 'group', 'remove-member', `group-id=${group.id}`, `user-id=${id}`])
        }
        log(`${email} can no longer run the deploy commands in ${settings.project}`)
      } else {
        change(['iam', 'group', 'add-members', `group-id=${group.id}`, `user-ids.0=${id}`])
        log(`${email} can run the deploy commands in ${settings.project}`)
      }
    }
  }

  // plan and apply. A plan meant for an apply allows no mocked dependency outputs
  // (DEPLOY_EXACT_PLAN): a saved plan keeps every value a unit was handed, so a unit whose
  // dependencies are not applied yet fails to plan instead, and is applied in a later run. The
  // plans are encrypted like the state. Without a unit, every unit but shared, which only an
  // administrator applies and only by its name.
  async function stack(mode) {
    const options =
      mode === 'plan'
        ? { save: { type: 'boolean', default: false }, ref: { type: 'string' } }
        : {
            saved: { type: 'boolean', default: false },
            'no-plan': { type: 'boolean', default: false },
            ref: { type: 'string' },
          }
    const { values, positionals } = parseArgs({ args: rest, options, allowPositionals: true })
    if (positionals.length < 1 || positionals.length > 2 || (values.saved && values['no-plan'])) {
      throw misuse()
    }
    const [name, unit] = positionals
    const settings = environment(name)
    const vars = {
      ...operator(settings),
      TG_NO_DEPENDENCY_FETCH_OUTPUT_FROM_STATE: 'true',
      // Another branch or tag than env.yaml's, until an apply without it
      ...(values.ref ? { DEPLOY_REF: values.ref } : {}),
    }
    const filter = unit ?? '!shared'
    if (!unit || unit === 'supabase') await trySupabaseToken(settings, vars)
    const plans = join(settings.live, '.terragrunt-plans')
    const withUnit = unit ? `${unit} ` : ''
    const stackRun = (filters, words) => [
      'stack',
      'run',
      '--working-dir',
      settings.live,
      ...filters.flatMap((one) => ['--filter', one]),
      ...words,
    ]
    const run = (words, extra = {}, filters = [filter]) =>
      interactive('terragrunt', stackRun(filters, words), { ...vars, ...extra })

    const planExact = () => {
      fs.remove(plans)
      try {
        run(['--out-dir', plans, '--', 'plan'], { DEPLOY_EXACT_PLAN: 'true' })
      } catch (error) {
        throw failure(
          `A unit did not plan. If its dependencies are not applied yet, apply them first by name: pnpm deploy:apply ${name} <unit>`,
          error.exitCode,
        )
      }
    }
    // The one answer of an apply, or of a round of one: Terragrunt asks nothing more
    const confirm = async (question) => {
      if (!/^(y|Y|yes)$/.test(await ask(question))) throw failure('Nothing applied.')
    }

    if (mode === 'plan') {
      if (!values.save) return run(['--', 'plan'])
      planExact()
      log(`The plans are kept for pnpm deploy:apply ${name} ${withUnit}--saved`)
      return
    }
    const target = `${name}${unit ? ` (${unit})` : ''}`
    if (values['no-plan']) {
      // Each unit plans at its apply, after the units it reads, with their real outputs: the way
      // through a first setup, where an exact plan of a later unit fails
      await confirm(`Apply ${target} with no plan shown first? [y/N] `)
      return run(['--', 'apply'], { TG_NON_INTERACTIVE: 'true' })
    }
    // A unit without a kept plan would otherwise be planned and approved here unseen: OpenTofu asks
    // for it instead. A kept plan applies without asking.
    const applyKept = (filters) =>
      run(['--out-dir', plans, '--', 'apply'], { TG_NO_AUTO_APPROVE: 'true' }, filters)
    if (values.saved || unit) {
      if (values.saved && !fs.exists(plans)) {
        throw failure(`No plans are kept: pnpm deploy:plan ${name} ${withUnit}--save first`)
      }
      if (!values.saved) planExact()
      await confirm(`Apply the plans above to ${target}? [y/N] `)
      applyKept([filter])
      fs.remove(plans)
      return
    }
    // Every unit but shared, in rounds: an exact plan takes no mocked output, so a unit whose
    // dependencies are not applied yet cannot plan before them. Each round plans every unit still
    // waiting and goes on past those that fail, shows the plans, asks once and applies exactly the
    // plans it showed; the next round plans those that waited, with the outputs just applied. A
    // round that plans nothing stops the apply.
    const units = [
      ...fs.read(join(settings.live, 'terragrunt.stack.hcl')).matchAll(/^unit "([^"]+)"/gm),
    ]
      .map((match) => match[1])
      .filter((one) => one !== 'shared')
    let waiting = units
    for (;;) {
      const filters = waiting === units ? [filter] : waiting
      fs.remove(plans)
      // A unit that failed is told apart by the plan it did not keep, not by the status
      runTool(
        'terragrunt',
        stackRun(filters, ['--queue-ignore-errors', '--out-dir', plans, '--', 'plan']),
        {
          env: { ...vars, DEPLOY_EXACT_PLAN: 'true' },
          capture: false,
        },
      )
      const planned = waiting.filter((one) =>
        fs.exists(join(plans, '.terragrunt-stack', one, 'tfplan.tfplan')),
      )
      const later = waiting.filter((one) => !planned.includes(one))
      if (planned.length === 0) {
        throw failure(
          `No unit planned: see the errors above. A unit that reads shared plans once an administrator applied it: pnpm deploy:apply ${name} shared`,
        )
      }
      const every = planned.length === units.length
      if (later.length > 0) log(`Planned once those are applied: ${later.join(', ')}`)
      await confirm(
        `Apply the plans above to ${every ? name : `${name} (${planned.join(', ')})`}? [y/N] `,
      )
      applyKept(every ? [filter] : planned)
      fs.remove(plans)
      if (later.length === 0) return
      waiting = later
    }
  }

  if (!Object.hasOwn(commands, command ?? ''))
    throw usage(`pnpm deploy:<command>, one of ${COMMANDS}`)
  await commands[command]()
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deploy().catch((error) => {
    console.error(error.message)
    process.exitCode = error.exitCode ?? 1
  })
}
