// The compose file of a deployment hands the postgres role's URL and the runtime roles' passwords
// to the tools container alone: the API reaches the database only through its runtime roles
// (docs/ARCHITECTURE.md, Tenant isolation).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const compose = readFileSync(new URL('../infra/docker/compose.yaml', import.meta.url), 'utf8')
const local = readFileSync(new URL('../infra/local/compose.yaml', import.meta.url), 'utf8')

/** The variables of each service's `environment`, read by indentation from `services`. */
export function environments(text) {
  const services = {}
  let inServices = false
  let service = null
  let inEnvironment = false
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      inServices = /^services:\s*$/.test(line)
      service = null
      inEnvironment = false
      continue
    }
    if (!inServices) continue
    const serviceName = /^ {2}([\w-]+):\s*$/.exec(line)
    if (serviceName) {
      service = serviceName[1]
      services[service] = []
      inEnvironment = false
      continue
    }
    if (service === null) continue
    if (/^ {4}environment:\s*$/.test(line)) {
      inEnvironment = true
      continue
    }
    if (/^ {4}\S/.test(line)) inEnvironment = false
    const variable = /^ {6}([A-Z][A-Z0-9_]*):/.exec(line)
    if (inEnvironment && variable) services[service].push(variable[1])
  }
  return services
}

/** The ports each service lists under `expose`, read by indentation from `services`. */
export function exposed(text) {
  const services = {}
  let inServices = false
  let service = null
  let inExpose = false
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      inServices = /^services:\s*$/.test(line)
      service = null
      continue
    }
    if (!inServices) continue
    const serviceName = /^ {2}([\w-]+):\s*$/.exec(line)
    if (serviceName) {
      service = serviceName[1]
      services[service] = []
      inExpose = false
      continue
    }
    if (service === null) continue
    if (/^ {4}expose:\s*$/.test(line)) {
      inExpose = true
      continue
    }
    if (/^ {4}\S/.test(line)) inExpose = false
    const port = /^ {6}- '?(\d+)'?\s*$/.exec(line)
    if (inExpose && port) services[service].push(port[1])
  }
  return services
}

/** The lines of one service, from its name to the next service or top-level key. */
export function service(text, name) {
  const lines = text.split('\n')
  const start = lines.indexOf(`  ${name}:`)
  if (start === -1) return ''
  const end = lines.findIndex((line, index) => index > start && /^( {2})?\S/.test(line))
  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}

/** The settings of imgproxy's own environment but its key, its salt and its sources. */
const imgproxySettings = (text) =>
  [...service(text, 'imgproxy').matchAll(/^ {6}(IMGPROXY_\w+: .*)$/gm)]
    .map((match) => match[1])
    .filter((line) => !/^IMGPROXY_(KEY|SALT|ALLOWED_SOURCES):/.test(line))

/** The image a service runs. */
const image = (text, name) => /^ {4}image: (\S+)$/m.exec(service(text, name))?.[1]

// Coolify's proxy routes a host to the one port its service exposes: the domains of the deployment
// name none (infra/modules/deployment). Mail's own port, 1025, and imgproxy's, which the API alone
// asks, stay inside the deployment's network.
const PORTS = {
  api: ['3001'],
  panel: ['8080'],
  portal: ['8080'],
  admin: ['8080'],
  mail: ['8025'],
  imgproxy: [],
  tools: [],
}

/** Whether a variable is a key of the bucket. */
const BUCKET_KEY = /^S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)$/

const MIGRATION_ONLY = /^(DATABASE_MIGRATION_URL|OPOS_\w+_PASSWORD)$/

/** What the seed reads beside the postgres URL (packages/db/src/seed.ts). */
const SEED_VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'PAYMENT_CREDENTIALS_KEY',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
]

describe('the compose file of a deployment', () => {
  const services = environments(compose)

  it('reads every service with its variables', () => {
    assert.deepEqual(Object.keys(services).sort(), [
      'admin',
      'api',
      'imgproxy',
      'mail',
      'panel',
      'portal',
      'tools',
    ])
    assert.ok(services.api.includes('DATABASE_URL'))
  })

  it('hands the postgres URL and the role passwords to the tools alone', () => {
    assert.ok(services.tools.includes('DATABASE_MIGRATION_URL'))
    for (const [name, variables] of Object.entries(services)) {
      if (name === 'tools') continue
      assert.deepEqual(
        variables.filter((variable) => MIGRATION_ONLY.test(variable)),
        [],
        name,
      )
    }
  })

  it('catches a migration variable given to another service', () => {
    const leaked = compose.replace(
      '      DATABASE_URL: ${DATABASE_URL:?}',
      '      DATABASE_URL: ${DATABASE_URL:?}\n      DATABASE_MIGRATION_URL: ${DATABASE_MIGRATION_URL:?}',
    )
    assert.ok(environments(leaked).api.includes('DATABASE_MIGRATION_URL'))
  })

  it('exposes the one port each routed service listens on, and none of the tools', () => {
    assert.deepEqual(exposed(compose), PORTS)
  })

  it('catches a routed service that exposes no port', () => {
    const unexposed = compose.replace(/^ {4}expose:\n {6}- '3001'\n/m, '')
    assert.deepEqual(exposed(unexposed).api, [])
  })

  // The seed of a deployment that seeds runs in the tools, after the database steps: it reaches
  // Supabase Auth, seals with the API's key and puts its demo files into the bucket
  // (docs/adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md)
  it('hands the tools the switch of the seed and what the seed reaches', () => {
    assert.match(service(compose, 'tools'), /^ {6}OPOS_SEED: \$\{OPOS_SEED:-false\}$/m)
    for (const variable of SEED_VARIABLES) {
      assert.ok(services.tools.includes(variable), variable)
    }
  })

  // docs/specs/0012-file-storage.md, W2, and docs/specs/0013-image-variants.md, I3; the tools hold
  // the bucket's key for the seed of Dev, a deployment the seed alone runs in
  // (docs/adr/0045-let-the-seed-put-its-demo-files-into-the-bucket.md)
  it("gives the bucket's key to the API and the tools alone, and imgproxy's key to the API and imgproxy alone", () => {
    for (const variable of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'IMGPROXY_KEY']) {
      assert.ok(services.api.includes(variable), variable)
    }
    for (const [name, variables] of Object.entries(services)) {
      if (name !== 'api' && name !== 'tools') {
        assert.deepEqual(
          variables.filter((variable) => BUCKET_KEY.test(variable)),
          [],
          name,
        )
      }
      if (name !== 'api' && name !== 'imgproxy') {
        assert.deepEqual(
          variables.filter((variable) => /^IMGPROXY_(KEY|SALT)$/.test(variable)),
          [],
          name,
        )
      }
    }
  })

  it('catches a bucket key given to imgproxy', () => {
    const leaked = compose.replace(
      /^( {6}IMGPROXY_ALLOWED_SOURCES: .*\n)/m,
      '$1      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY:?}\n',
    )
    assert.ok(environments(leaked).imgproxy.includes('S3_SECRET_ACCESS_KEY'))
  })

  it("runs the local stack's imgproxy, with its settings, reading the bucket alone", () => {
    assert.equal(image(compose, 'imgproxy'), image(local, 'imgproxy'))
    assert.match(image(compose, 'imgproxy'), /^[\w./-]+:v[\d.]+@sha256:[0-9a-f]{64}$/)
    assert.deepEqual(imgproxySettings(compose), imgproxySettings(local))
    assert.match(
      service(compose, 'imgproxy'),
      /IMGPROXY_ALLOWED_SOURCES: \$\{S3_ENDPOINT:\?\}\/\$\{S3_BUCKET:\?\}\//,
    )
    assert.match(service(compose, 'api'), /IMGPROXY_URL: http:\/\/imgproxy:8080\n/)
  })

  it('catches a setting of imgproxy the deployment drops', () => {
    const dropped = compose.replace("      IMGPROXY_STRIP_METADATA: 'true'\n", '')
    assert.notDeepEqual(imgproxySettings(dropped), imgproxySettings(local))
  })
})

/**
 * Runs the tools' entrypoint with pnpm, touch and sleep replaced by fakes that log their call, the
 * pnpm script named `fail` failing; returns the exit status and the calls in order.
 */
function runTools({ seed, fail } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tools-'))
  const log = join(dir, 'log')
  for (const name of ['pnpm', 'touch', 'sleep']) {
    const fake = join(dir, name)
    writeFileSync(
      fake,
      `#!/bin/sh\necho "${name} $*" >> "$LOG"\n[ "${name} $*" != "pnpm run $FAIL" ]\n`,
    )
    chmodSync(fake, 0o755)
  }
  const env = { PATH: `${dir}:${process.env.PATH}`, LOG: log, FAIL: fail ?? '' }
  if (seed !== undefined) env.OPOS_SEED = seed
  const { status } = spawnSync('sh', [fileURLToPath(TOOLS)], { env })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  rmSync(dir, { recursive: true })
  return { status, calls }
}

const TOOLS = new URL('../infra/docker/tools.sh', import.meta.url)
const STEPS = ['pnpm run db:roles', 'pnpm run db:migrate', 'pnpm run db:verify']
const READY = ['touch /tmp/ready', 'sleep infinity']

describe('the database steps of a deployment', () => {
  it('runs the roles, the migrations and the verification, then is ready', () => {
    assert.deepEqual(runTools({ seed: 'false' }), { status: 0, calls: [...STEPS, ...READY] })
  })

  it('seeds after the verification and before it is ready, when the deployment seeds', () => {
    assert.deepEqual(runTools({ seed: 'true' }), {
      status: 0,
      calls: [...STEPS, 'pnpm run db:seed', ...READY],
    })
  })

  it('seeds nothing where the switch is not set', () => {
    assert.deepEqual(runTools(), { status: 0, calls: [...STEPS, ...READY] })
  })

  it('refuses a switch that is neither true nor false', () => {
    const { status, calls } = runTools({ seed: 'yes' })
    assert.notEqual(status, 0)
    assert.deepEqual(calls, [])
  })

  it('never gets ready once a step failed, the seed included', () => {
    for (const fail of ['db:migrate', 'db:seed']) {
      const { status, calls } = runTools({ seed: 'true', fail })
      assert.notEqual(status, 0, fail)
      assert.equal(calls.at(-1), `pnpm run ${fail}`, fail)
    }
  })
})

/** Every `- '<address>:<port>:<port>'` a service publishes under `ports`. */
const published = (text) =>
  [...text.matchAll(/^ {6}- '([^']*)'\s*$/gm)]
    .map((match) => match[1])
    .filter((p) => p.includes(':'))

describe('the compose file of the local stack', () => {
  const services = environments(local)

  it('runs the bucket and the image server, each image pinned by its digest', () => {
    assert.deepEqual(Object.keys(services).sort(), ['imgproxy', 's3'])
    const images = [...local.matchAll(/^ {4}image: (\S+)$/gm)].map((match) => match[1])
    assert.equal(images.length, 2)
    for (const image of images) assert.match(image, /^[\w./-]+:v[\d.]+@sha256:[0-9a-f]{64}$/)
  })

  // The local stack publishes on every interface unless told otherwise (docs/ARCHITECTURE.md,
  // Tooling and versions): these two publish on the loopback address alone.
  it('publishes each port on 127.0.0.1 alone', () => {
    const ports = published(local)
    assert.equal(ports.length, 2)
    for (const port of ports) assert.match(port, /^127\.0\.0\.1:/)
  })

  it('gives the bucket key to the gateway alone and the signing key to imgproxy alone', () => {
    assert.ok(services.s3.includes('ROOT_SECRET_ACCESS_KEY'))
    assert.deepEqual(
      services.imgproxy.filter((variable) => /SECRET|ACCESS_KEY/.test(variable)),
      [],
    )
    assert.ok(services.imgproxy.includes('IMGPROXY_KEY'))
    assert.ok(!services.s3.includes('IMGPROXY_KEY'))
  })

  it('lets imgproxy read the bucket alone and keep no copyright field', () => {
    assert.match(
      local,
      /IMGPROXY_ALLOWED_SOURCES: \$\{IMGPROXY_BUCKET_ENDPOINT:\?\}\/\$\{S3_BUCKET:\?\}\//,
    )
    assert.match(local, /IMGPROXY_KEEP_COPYRIGHT: 'false'/)
    assert.match(local, /IMGPROXY_STRIP_METADATA: 'true'/)
  })
})
