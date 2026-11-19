// The compose file of a deployment hands the postgres role's URL and the runtime roles' passwords
// to the tools container alone: the API reaches the database only through its runtime roles
// (docs/ARCHITECTURE.md, Tenant isolation).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const compose = readFileSync(new URL('../infra/docker/compose.yaml', import.meta.url), 'utf8')

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

// Coolify's proxy routes a host to the one port its service exposes: the domains of the deployment
// name none (infra/modules/deployment). Mail's own port, 1025, stays inside the deployment's network.
const PORTS = {
  api: ['3001'],
  panel: ['8080'],
  portal: ['8080'],
  admin: ['8080'],
  mail: ['8025'],
  tools: [],
}

const MIGRATION_ONLY = /^(DATABASE_MIGRATION_URL|OPOS_\w+_PASSWORD)$/

describe('the compose file of a deployment', () => {
  const services = environments(compose)

  it('reads every service with its variables', () => {
    assert.deepEqual(Object.keys(services).sort(), [
      'admin',
      'api',
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
})

const local = readFileSync(new URL('../infra/local/compose.yaml', import.meta.url), 'utf8')

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
