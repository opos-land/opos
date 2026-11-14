// The compose file of a deployment hands the postgres role's URL and the runtime roles' passwords
// to the tools container alone: the API reaches the database only through its runtime roles
// (docs/ARCHITECTURE.md, Tenant isolation).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const compose = readFileSync(new URL('../infra/docker/compose.yaml', import.meta.url), 'utf8')

/** The variables of each service's `environment`, read by indentation from the compose file. */
export function environments(text) {
  const services = {}
  let service = null
  let inEnvironment = false
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      service = null
      inEnvironment = false
      continue
    }
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

const MIGRATION_ONLY = /^(DATABASE_MIGRATION_URL|OPOS_\w+_PASSWORD)$/

describe('the compose file of a deployment', () => {
  const services = environments(compose)

  it('reads every service with its variables', () => {
    assert.deepEqual(Object.keys(services).sort(), ['admin', 'api', 'panel', 'portal', 'tools'])
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
})
