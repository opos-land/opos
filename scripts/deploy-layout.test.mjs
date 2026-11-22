import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readStack } from './deploy-graph.mjs'
import { addressesIn, interpolate } from './deploy-layout.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const fixtures = []
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true })
})

function repository(files) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-layout-'))
  fixtures.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const lines = (...rows) => `${rows.join('\n')}\n`

const STACK = {
  'infra/live/e/env.yaml': lines('zone: example.org', 'ip: 192.0.2.1'),
  'infra/live/e/terragrunt.stack.hcl': lines(
    'locals {',
    '  env = yamldecode(file("env.yaml"))',
    '}',
    'unit "mail" {',
    '  source = "../../units/mail"',
    '  path   = "mail"',
    '  values = { zone = local.env.zone }',
    '}',
    'unit "app" {',
    '  source = "../../units/app"',
    '  path   = "app"',
    '  values = { zone = local.env.zone, ip = local.env.ip }',
    '  autoinclude {',
    '    dependency "mail" {',
    '      config_path = unit.mail.path',
    '    }',
    '    inputs = {',
    '      smtp_host = dependency.mail.outputs.smtp_host',
    '      lost      = dependency.mail.outputs.nothing',
    '      bad       = dependency.mail.outputs.bad',
    '    }',
    '  }',
    '}',
    'unit "ci" {',
    '  source = "../../units/ci"',
    '  path   = "ci"',
    '}',
    'unit "remote" {',
    '  source = "git::https://example.invalid/remote.git"',
    '  path   = "remote"',
    '}',
  ),
  'infra/coolify.hcl': lines(
    'generate "coolify" {',
    '  path      = "coolify.tf"',
    '  if_exists = "overwrite_terragrunt"',
    '  contents  = <<-EOF',
    '    provider "coolify" {',
    '      endpoint = "https://panel.coolify.example/"',
    '    }',
    '  EOF',
    '}',
  ),
  'infra/units/mail/terragrunt.hcl': lines(
    'terraform {',
    '  source = "${get_repo_root()}/infra/modules/mail"',
    '}',
    'inputs = {',
    '  zone = values.zone',
    '}',
  ),
  'infra/units/app/terragrunt.hcl': lines(
    'terraform {',
    '  source = "${get_repo_root()}/infra/modules/app"',
    '}',
    'inputs = {',
    '  zone = values.zone',
    '  ip   = values.ip',
    '  name = "main"',
    '}',
  ),
  'infra/units/ci/terragrunt.hcl': lines(
    'include "coolify" {',
    '  path = find_in_parent_folders("coolify.hcl")',
    '}',
    'terraform {',
    '  source = "${get_repo_root()}/infra/modules/ci"',
    '}',
  ),
  'infra/modules/mail/main.tf': lines(
    'variable "zone" {}',
    'resource "scaleway_tem_domain" "this" {',
    '  name = var.zone',
    '}',
    'output "smtp_host" {',
    '  value = scaleway_tem_domain.this.smtp_host',
    '}',
    'output "bad" {',
    '  value = local.missing',
    '}',
  ),
  'infra/modules/app/main.tf': lines(
    'variable "zone" {}',
    'variable "ip" {}',
    'variable "name" {}',
    'variable "smtp_host" {}',
    'variable "lost" {}',
    'variable "bad" {}',
    'variable "never" {}',
    'variable "server" {',
    '  default = "srv-1"',
    '}',
    '',
    'locals {',
    '  hosts  = { web = "web.${var.zone}", api = var.zone }',
    '  secret = { for key, version in data.scaleway_secret_version.this : key => base64decode(version.data) }',
    '  environment = {',
    '    DATABASE_URL = "postgres://u:${urlencode(local.secret["db-password"])}@db.example.com:5432/x"',
    '    SMTP_HOST    = var.smtp_host',
    '    SMTP_PORT    = "465"',
    '    WEB_URL      = "https://${local.hosts.web}"',
    '    NEVER        = var.never',
    '    LOST         = var.lost',
    '    BAD          = var.bad',
    '  }',
    '  loop = local.loop',
    '}',
    '',
    'resource "coolify_environment" "this" {',
    '  name = var.name',
    '}',
    '',
    'resource "coolify_application" "this" {',
    '  name                    = "shop"',
    '  environment_uuid        = coolify_environment.this.uuid',
    '  server_uuid             = var.server',
    '  docker_compose_location = "/compose.yaml"',
    '  docker_compose_domains = format("[%s]", join(",", [',
    '    for service, host in local.hosts : format("{\\"name\\":%q,\\"domain\\":%q}", service, "https://${host}")',
    '  ]))',
    '}',
    '',
    'resource "coolify_application" "plain" {',
    '  name                    = "plain"',
    '  docker_compose_location = "/plain.yaml"',
    '}',
    '',
    'resource "coolify_application" "elsewhere" {',
    '  name                    = "gone"',
    '  docker_compose_location = "/missing.yaml"',
    '}',
    '',
    'data "scaleway_secret_version" "this" {',
    '  for_each    = toset(["db-password"])',
    '  secret_name = each.key',
    '}',
    '',
    'resource "coolify_environment_variable" "this" {',
    '  for_each         = local.environment',
    '  application_uuid = coolify_application.this.uuid',
    '  key              = each.key',
    '  value            = each.value',
    '}',
    '',
    'data "scaleway_domain_zone" "this" {',
    '  domain = var.zone',
    '}',
    '',
    'resource "scaleway_domain_record" "this" {',
    '  for_each = local.hosts',
    '  dns_zone = data.scaleway_domain_zone.this.id',
    '  name     = each.value == var.zone ? "" : trimsuffix(each.value, ".${var.zone}")',
    '  type     = "A"',
    '  data     = var.ip',
    '}',
    '',
    'resource "scaleway_domain_record" "mx" {',
    '  dns_zone = data.scaleway_domain_zone.this.id',
    '  name     = ""',
    '  type     = "MX"',
    '  data     = "10 mx.example.net."',
    '}',
    '',
    'resource "scaleway_domain_record" "counted" {',
    '  count    = 2',
    '  dns_zone = local.loop',
    '  name     = "n${count.index}"',
    '  type     = "A"',
    '  data     = var.ip',
    '}',
    '',
    'resource "scaleway_domain_record" "unsure" {',
    '  for_each = local.loop',
    '  name     = "x"',
    '}',
  ),
  'compose.yaml': lines(
    'services:',
    '  web:',
    '    build:',
    '      context: .',
    '      target: web',
    '      args:',
    '        API: https://example.org',
    "    expose: ['8080']",
    '  api:',
    '    image: example/api',
    "    expose: ['3001']",
    '    depends_on:',
    '      cache:',
    '        condition: service_healthy',
    '    environment:',
    '      DATABASE_URL: ${DATABASE_URL:?}',
    '      SMTP_HOST: ${SMTP_HOST}',
    '      SMTP_PORT: ${SMTP_PORT}',
    '      CACHE_URL: http://cache:6379',
    '      WEB_URL: ${WEB_URL}',
    '      SELF: https://example.org/x',
    '      NEVER: ${NEVER}',
    '      LOST: ${LOST}',
    '      BAD: ${BAD}',
    '      PLAIN: 3',
    '      FALLBACK: ${NOPE:-fallback}',
    '      UNSET: ${NOPE2}',
    '  cache:',
    '    image: redis',
    "    volumes: ['data:/data']",
    '    healthcheck:',
    "      test: ['CMD', 'true']",
    '  worker:',
    '    image: example/worker',
    '    environment:',
    '      - MODE=batch',
    '      - API=http://api:3001',
    '      - CACHE_HOST=cache',
    '      - BARE',
    '    depends_on: [cache]',
    'volumes:',
    '  data:',
  ),
  'plain.yaml': lines('services:', '  solo:', '    build: .'),
  'infra/modules/ci/main.tf': lines(
    'data "scaleway_secret_version" "token" {',
    '  secret_name = "ci-token"',
    '}',
    '',
    'resource "coolify_environment" "shared" {',
    '  name = "shared"',
    '}',
    '',
    'resource "coolify_service" "cache" {',
    '  name               = "cache"',
    '  environment_uuid   = coolify_environment.shared.uuid',
    '  server_uuid        = "srv-1"',
    '  docker_compose_raw = templatefile("${path.module}/cache.tftpl", { image = "c:1" })',
    '  urls               = [{ name = "store", url = "https://store.example.org:3000" }]',
    '}',
    '',
    'resource "coolify_service" "broken" {',
    '  name               = "broken"',
    '  docker_compose_raw = "services: ["',
    '}',
    '',
    'resource "coolify_service" "empty" {',
    '  name               = "empty"',
    '  docker_compose_raw = "volumes: {}"',
    '}',
    '',
    'resource "coolify_envs_bulk" "this" {',
    '  resource_uuid = coolify_service.cache.uuid',
    '  variables     = { TOKEN = base64decode(data.scaleway_secret_version.token.data) }',
    '}',
    '',
    'resource "github_actions_variable" "this" {',
    '  for_each = {',
    '    API   = "https://example.org"',
    '    HOOK  = "https://panel.coolify.example/api/deploy"',
    '    OTHER = "https://hooks.elsewhere.net/x"',
    '  }',
    '  value = each.value',
    '}',
    '',
    'resource "github_actions_secret" "this" {',
    '  value = base64decode(data.scaleway_secret_version.token.data)',
    '}',
    '',
    'resource "supabase_settings" "this" {',
    '  auth = jsonencode({ hook = "https://example.org/hooks", site = ["https://web.example.org"] })',
    '}',
    '',
    'resource "null_resource" "plain" {',
    '  triggers = { a = "b", n = 1, json = "{not json" }',
    '}',
  ),
  'infra/modules/ci/cache.tftpl': lines(
    'services:',
    '  store:',
    '    image: ${image}',
    '    environment:',
    '      TOKEN: $${TOKEN}',
  ),
}

describe('interpolate', () => {
  it("fills a compose file's variables as Docker Compose does", () => {
    const variables = { A: 'a', E: '' }
    assert.deepEqual(interpolate('x${A}y$A', variables), { text: 'xaya', names: ['A'] })
    assert.deepEqual(interpolate('${A:?}${B:-b}${B-c}${E:-e}${E-f}', variables).text, 'abce')
    assert.equal(interpolate('${B}', variables).text, '‹B is not set›')
    assert.equal(interpolate('$${A}', variables).text, '${A}')
  })
})

describe('addressesIn', () => {
  it('finds the hosts a value reaches, secrets and all', () => {
    assert.deepEqual(addressesIn('postgres://u:‹secret a b›@db.example.com:5432/x'), [
      { scheme: 'postgres', host: 'db.example.com', port: '5432' },
    ])
    assert.deepEqual(addressesIn('see https://a.example and http://b:80/'), [
      { scheme: 'https', host: 'a.example', port: null },
      { scheme: 'http', host: 'b', port: '80' },
    ])
    assert.deepEqual(addressesIn('smtp://‹mail.smtp_host›:465'), [
      { scheme: 'smtp', host: '‹mail.smtp_host›', port: '465' },
    ])
    assert.deepEqual(addressesIn('no address'), [])
  })
})

describe('the deployment', () => {
  it('draws what runs where and what each part reaches', async () => {
    const root = repository(STACK)
    const { deployment } = await readStack(join(root, 'infra/live/e'), { root })
    const node = (id) => deployment.nodes.find((candidate) => candidate.id === id)
    assert.deepEqual(
      deployment.nodes.map((candidate) => candidate.id),
      [
        'internet',
        'resource:ci:github',
        'resource:ci:supabase',
        'secrets',
        'app:solo',
        'app:web',
        'app:api',
        'app:cache',
        'app:worker',
        'ci:store',
        'endpoint:db.example.com',
        'endpoint:scaleway_tem_domain.this.smtp_host',
        'endpoint:panel.coolify.example',
        'endpoint:hooks.elsewhere.net',
      ],
    )

    const api = node('app:api')
    assert.equal(api.group, 'shop · main')
    assert.equal(api.unit, 'app')
    assert.equal(api.host, 'example.org')
    assert.equal(api.url, 'https://example.org')
    assert.deepEqual(api.ports, ['3001'])
    assert.equal(api.image, 'example/api')
    assert.equal(api.server, 'srv-1')
    assert.deepEqual(api.records, [
      { type: 'MX', data: '10 mx.example.net.' },
      { type: 'A', data: '192.0.2.1' },
    ])
    assert.deepEqual(api.secrets, ['db-password'])
    const env = Object.fromEntries(api.env.map((entry) => [entry.name, entry]))
    assert.deepEqual(env.DATABASE_URL, {
      name: 'DATABASE_URL',
      value: 'postgres://u:‹secret db-password›@db.example.com:5432/x',
      from: ['DATABASE_URL'],
    })
    assert.equal(env.SMTP_HOST.value, '‹scaleway_tem_domain.this.smtp_host›')
    assert.equal(env.NEVER.value, '‹var.never›')
    assert.equal(env.LOST.value, '‹mail.nothing›')
    assert.equal(env.BAD.value, '‹mail.bad›')
    assert.equal(env.PLAIN.value, '3')
    assert.deepEqual(env.PLAIN.from, [])
    assert.equal(env.FALLBACK.value, 'fallback')
    assert.equal(env.UNSET.value, '‹NOPE2 is not set›')

    const solo = node('app:solo')
    assert.equal(solo.group, 'plain · ?')
    assert.equal(solo.server, null)
    assert.equal(solo.url, null)
    assert.deepEqual(solo.build, { target: null, args: {} })

    const web = node('app:web')
    assert.equal(web.image, null)
    assert.deepEqual(web.build, { target: 'web', args: { API: 'https://example.org' } })
    const cache = node('app:cache')
    assert.equal(cache.host, null)
    assert.deepEqual(cache.volumes, ['data:/data'])
    assert.equal(cache.health, true)
    assert.deepEqual(
      node('app:worker').env.map((entry) => entry.value),
      ['batch', 'http://api:3001', 'cache', ''],
    )
    const store = node('ci:store')
    assert.equal(store.group, 'cache · shared')
    assert.equal(store.url, 'https://store.example.org:3000')
    assert.equal(store.host, 'store.example.org')
    assert.deepEqual(store.secrets, ['ci-token'])
    assert.deepEqual(store.records, [])

    assert.deepEqual(node('endpoint:scaleway_tem_domain.this.smtp_host').ports, ['465'])
    assert.equal(node('endpoint:panel.coolify.example').provider, 'coolify')
    assert.equal(node('endpoint:db.example.com').provider, null)
    assert.deepEqual(node('resource:ci:github').resources, [
      'github_actions_secret.this',
      'github_actions_variable.this',
    ])
    assert.deepEqual(node('secrets').names, ['ci-token', 'db-password'])
    assert.deepEqual(deployment.server, [
      { uuid: 'srv-1', addresses: ['192.0.2.1'], api: 'https://panel.coolify.example/' },
    ])

    const links = deployment.links.map(({ from, to, kind, via }) => [
      `${from} > ${to}`,
      kind,
      via.map((entry) => entry.name).join(' '),
    ])
    assert.deepEqual(links, [
      ['internet > app:web', 'request', 'https://web.example.org'],
      ['internet > app:api', 'request', 'https://example.org'],
      ['internet > ci:store', 'request', 'https://store.example.org:3000'],
      ['app:web > app:api', 'names', 'build API'],
      ['app:api > endpoint:db.example.com', 'request', 'DATABASE_URL'],
      ['app:api > endpoint:scaleway_tem_domain.this.smtp_host', 'request', 'SMTP_HOST'],
      ['app:api > app:cache', 'internal', 'CACHE_URL'],
      ['app:api > app:web', 'names', 'WEB_URL'],
      ['app:worker > app:api', 'internal', 'API'],
      ['app:worker > app:cache', 'internal', 'CACHE_HOST'],
      ['app:cache > app:api', 'order', 'service_healthy'],
      ['app:cache > app:worker', 'order', 'started'],
      ['resource:ci:github > app:api', 'config', 'github_actions_variable.this["API"].value'],
      [
        'resource:ci:github > endpoint:panel.coolify.example',
        'config',
        'github_actions_variable.this["HOOK"].value',
      ],
      [
        'resource:ci:github > endpoint:hooks.elsewhere.net',
        'config',
        'github_actions_variable.this["OTHER"].value',
      ],
      ['resource:ci:supabase > app:api', 'config', 'supabase_settings.this.auth.hook'],
      ['resource:ci:supabase > app:web', 'config', 'supabase_settings.this.auth.site[0]'],
      ['app:api > secrets', 'secret', 'db-password'],
      ['ci:store > secrets', 'secret', 'ci-token'],
      ['resource:ci:github > secrets', 'secret', 'ci-token'],
    ])
    assert.ok(deployment.layout.nodes['app:api'].x > deployment.layout.nodes.internet.x)
    // Who calls in on the left, the containers by their connections, what they rely on right
    const column = (id) => deployment.layout.nodes[id].column
    assert.deepEqual(
      ['internet', 'resource:ci:github', 'app:worker', 'app:web', 'app:api', 'app:cache'].map(
        column,
      ),
      [0, 0, 1, 1, 2, 3],
    )
    for (const id of ['endpoint:db.example.com', 'endpoint:panel.coolify.example', 'secrets']) {
      assert.equal(column(id), 4, id)
    }
    assert.deepEqual(deployment.layout.cycle, [])
    assert.deepEqual(deployment.warnings, [
      'The compose file /missing.yaml of coolify_application.elsewhere is not in this repository.',
      'The compose file of coolify_service.broken is not one Docker Compose reads.',
    ])
  })

  it('draws nothing for a stack that runs nothing', async () => {
    const root = repository({
      'infra/live/e/terragrunt.stack.hcl': 'locals {}\n',
    })
    const { deployment } = await readStack(join(root, 'infra/live/e'), { root })
    assert.deepEqual([deployment.nodes, deployment.links, deployment.server], [[], [], []])
  })

  it('draws the deployment of this repository', async () => {
    const { deployment } = await readStack(join(ROOT, 'infra/live/dev'), { root: ROOT })
    const ids = deployment.nodes.map((node) => node.id)
    for (const id of [
      'internet',
      'deployment:api',
      'deployment:tools',
      'deployment:imgproxy',
      'deployment:portal',
      'deployment:mail',
      'cache:cache',
      'cache:cache-ro',
      'secrets',
    ]) {
      assert.ok(ids.includes(id), id)
    }
    const link = (from, to) =>
      deployment.links.find((candidate) => candidate.from === from && candidate.to === to)
    assert.ok(link('deployment:api', 'deployment:imgproxy'))
    assert.ok(link('deployment:tools', 'deployment:api'))
    assert.ok(link('internet', 'deployment:portal'))
    const database = deployment.links.find(
      (candidate) =>
        candidate.from === 'deployment:api' && /^endpoint:db\..*\.supabase\.co$/.test(candidate.to),
    )
    assert.ok(database.via.some((entry) => entry.name === 'DATABASE_URL'))
    assert.ok(
      deployment.links.some(
        (candidate) =>
          candidate.from === 'deployment:imgproxy' && candidate.to.startsWith('endpoint:s3.'),
      ),
    )
    assert.ok(link('resource:supabase:supabase', 'deployment:api'))
    assert.ok(link('resource:github:github', 'cache:cache'))
    assert.deepEqual(deployment.warnings, [])
  })
})
