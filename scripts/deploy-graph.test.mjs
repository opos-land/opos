import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluate, layoutGraph, main, readStack, renderPage, shown } from './deploy-graph.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const fixtures = []
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true })
})

/** A repository holding `files`, keyed by their path. */
function repository(files) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-graph-'))
  fixtures.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const lines = (...rows) => `${rows.join('\n')}\n`

const STACK = {
  'infra/root.hcl': lines(
    '# What every unit shares',
    '# across the environment.',
    '',
    'locals {',
    '  env = yamldecode(file(find_in_parent_folders("env.yaml")))',
    '}',
    '',
    'generate "provider" {',
    '  path      = "provider.tf"',
    '  if_exists = "overwrite_terragrunt"',
    '  contents  = "provider {}"',
    '}',
    '',
    'inputs = {',
    '  region = local.env.region',
    '}',
  ),
  'infra/units/store/terragrunt.hcl': lines(
    '# A bucket. Values: name, size.',
    '',
    'include "root" {',
    '  path = find_in_parent_folders("root.hcl")',
    '}',
    '',
    'terraform {',
    '  source = "${get_repo_root()}/infra/modules/store"',
    '}',
    '',
    'inputs = {',
    '  name  = values.name',
    '  size  = try(values.size, 1)',
    '  extra = 3',
    '}',
  ),
  'infra/units/app/terragrunt.hcl': lines(
    '# The application.',
    '',
    'include "root" {',
    '  path = find_in_parent_folders("root.hcl")',
    '}',
    '',
    'include "extra" {',
    '  path = find_in_parent_folders("extra.hcl")',
    '}',
    '',
    'include "missing" {',
    '  path = find_in_parent_folders("nowhere.hcl")',
    '}',
    '',
    'terraform {',
    '  source = "../../modules/app"',
    '}',
    '',
    'dependency "store" {',
    '  config_path = "../store"',
    '}',
    '',
    'dependencies {',
    '  paths = ["../lone"]',
    '}',
    '',
    'generate "app" {',
    '  path     = "app.tf"',
    '  contents = "# ${values.branch}"',
    '}',
    '',
    'inputs = {',
    '  host   = values.host',
    '  url    = values.url',
    '  ghost  = values.missing',
    '  bucket = dependency.store.outputs.bucket',
    '}',
  ),
  'infra/units/lone/terragrunt.hcl': lines(
    'terraform {',
    '  source = "git::https://example.invalid/lone.git"',
    '}',
  ),
  'infra/modules/store/main.tf': lines(
    '# Makes the bucket.',
    '',
    'resource "thing" "this" {',
    '  for_each = var.names',
    '}',
    '',
    'resource "thing" "single" {',
    '  count = 1',
    '}',
    '',
    'data "lookup" "zone" {}',
    '',
    'ephemeral "secret" "token" {}',
    '',
    'module "nested" {',
    '  source = "./nested"',
    '}',
  ),
  'infra/modules/store/variables.tf': lines(
    'variable "name" {',
    '  description = "The bucket\'s name"',
    '  type        = string',
    '}',
    '',
    'variable "region" {',
    '  type = string',
    '}',
    '',
    'variable "size" {',
    '  type    = number',
    '  default = 1',
    '}',
    '',
    'variable "never_set" {',
    '  type      = string',
    '  sensitive = true',
    '}',
  ),
  'infra/modules/store/outputs.tf': lines(
    'output "bucket" {',
    '  description = "The bucket"',
    '  value       = thing.this',
    '}',
    '',
    'output "endpoint" {',
    '  value     = "https://example.invalid"',
    '  sensitive = true',
    '}',
  ),
  'infra/modules/store/versions.tf': lines(
    'terraform {',
    '  required_providers {',
    '    thing = {',
    '      source  = "example/thing"',
    '      version = "1.2.3"',
    '    }',
    '  }',
    '}',
  ),
  'infra/extra.hcl': lines('locals {}'),
  'infra/modules/app/resources.tf': lines(
    'terraform {',
    '  required_version = ">= 1.11"',
    '}',
    'resource "app" "this" {}',
  ),
  'infra/modules/app/variables.tf': lines(
    'variable "host" {}',
    'variable "url" {}',
    'variable "ghost" {',
    '  default = null',
    '}',
    'variable "region" {}',
    'variable "bucket" {}',
    'variable "endpoint" {}',
    'variable "files" {}',
    'variable "list" {}',
  ),
  'infra/live/test/env.yaml': lines(
    'region: fr-par',
    'app:',
    '  host: a.example',
    '  branch: main',
  ),
  'infra/live/test/terragrunt.stack.hcl': lines(
    'locals {',
    '  env  = yamldecode(file("env.yaml"))',
    '  host = local.env.app.host',
    '  loop = local.loop',
    '}',
    '',
    '# The bucket,',
    '# kept for a year.',
    'unit "store" {',
    '  source = "../../units/store"',
    '  path   = "store"',
    '',
    '  values = {',
    '    name    = "s"',
    '    ignored = 1',
    '  }',
    '}',
    '',
    'unit "app" {',
    '  source = "../../units/app"',
    '  path   = "app"',
    '',
    '  values = {',
    '    host   = local.host',
    '    branch = get_env("REF", local.env.app.branch)',
    '    url    = "https://${local.host}"',
    '    tags   = { a = [local.env.region, 2] }',
    '    later  = local.loop',
    '  }',
    '',
    '  autoinclude {',
    '    dependencies {',
    '      paths = [unit.store.path]',
    '    }',
    '',
    '    dependency "store" {',
    '      config_path  = unit.store.path',
    '      mock_outputs = { bucket = "mock" }',
    '    }',
    '',
    '    inputs = {',
    '      endpoint = dependency.store.outputs.endpoint',
    '      files    = { bucket = dependency.store.outputs.gone }',
    '      list     = [dependency.store.outputs.endpoint]',
    '    }',
    '  }',
    '}',
    '',
    'unit "lone" {',
    '  source = "../../units/lone"',
    '  path   = "lone"',
    '}',
    '',
    'unit "elsewhere" {',
    '  source = "git::https://example.invalid/units.git//x"',
    '  path   = "elsewhere"',
    '}',
  ),
}

describe('evaluate', () => {
  const scope = {
    local: { env: { app: { host: 'a.example', list: ['x', 'y'] }, empty: null } },
  }
  const value = (text) => evaluate(text, { scope, root: '/repo', from: '/repo/x' })

  it('reads literals', () => {
    assert.deepEqual(value('plain'), { known: true, value: 'plain', overrides: [] })
    assert.equal(value('${12.5}').value, 12.5)
    assert.equal(value('${true}').value, true)
    assert.equal(value('${false}').value, false)
    assert.equal(value('${null}').value, null)
    assert.deepEqual(value('${[1, "a", []]}').value, [1, 'a', []])
    assert.deepEqual(value('${{ a = 1, "b" : {} }}').value, { a: 1, b: {} })
    assert.equal(value('${"q\\"uote"}').value, 'q"uote')
    assert.equal(value('${(1)}').value, 1)
    assert.equal(value('$${literal}').value, '${literal}')
  })

  it('follows references, attributes and indexes', () => {
    assert.equal(value('${local.env.app.host}').value, 'a.example')
    assert.equal(value('${local.env.app.list[1]}').value, 'y')
    assert.equal(value('${local.env["app"].host}').value, 'a.example')
    assert.equal(value('${local.env.empty}').value, null)
    assert.equal(value('${local.env.nothing}').known, false)
    assert.equal(value('${local.env.empty.deeper}').known, false)
    assert.equal(value('${values.x}').known, false)
  })

  it('fills templates and leaves them unknown when a part is', () => {
    assert.equal(value('https://${local.env.app.host}/').value, 'https://a.example/')
    assert.equal(value('n${1}').value, 'n1')
    assert.equal(value('x${local.env.app}').known, false)
    assert.equal(value('x${local.env.none}').known, false)
  })

  it('runs the functions a stack uses', () => {
    assert.equal(value('${try(local.env.none, local.env.app.host)}').value, 'a.example')
    assert.equal(value('${try(local.env.none)}').known, false)
    assert.deepEqual(value('${get_env("REF", local.env.app.host)}'), {
      known: true,
      value: 'a.example',
      overrides: ['REF'],
    })
    assert.equal(value('${get_env("REF")}').known, false)
    assert.equal(value('${get_env(local.env.none, "x")}').known, false)
    assert.equal(value('${split("/", "a/b")[1]}').value, 'b')
    assert.equal(value('${trimsuffix("a/", "/")}').value, 'a')
    assert.equal(value('${trimsuffix("a", "/")}').value, 'a')
    assert.equal(value('${replace("a_b_c", "_", "-")}').value, 'a-b-c')
    assert.equal(value('${get_repo_root()}/infra').value, '/repo/infra')
    assert.equal(value('${upper("a")}').known, false)
    assert.equal(value('${get_env("REF", local.none)}').known, false)
    assert.equal(value('${yamldecode("a: [")}').known, false)
    assert.equal(value('${split("/", local.env.none)}').known, false)
  })

  it('reads files and YAML relative to where it evaluates', () => {
    const dir = repository({ 'a/env.yaml': 'k: v\n', 'a/b/c/.keep': '' })
    const from = join(dir, 'a/b/c')
    const at = (text) => evaluate(text, { scope: {}, root: dir, from })
    assert.equal(at('${find_in_parent_folders("env.yaml")}').value, join(dir, 'a/env.yaml'))
    assert.equal(at('${find_in_parent_folders("none.yaml")}').known, false)
    assert.deepEqual(at('${yamldecode(file(find_in_parent_folders("env.yaml")))}').value, {
      k: 'v',
    })
    assert.equal(at('${file("../../env.yaml")}').value, 'k: v\n')
    assert.equal(at('${file("missing")}').known, false)
    const outside = evaluate('${find_in_parent_folders("none.yaml")}', {
      scope: {},
      root: join(dir, 'elsewhere'),
      from,
    })
    assert.equal(outside.known, false)
  })

  it('leaves what it cannot evaluate unknown', () => {
    for (const text of [
      '${local.a == 1 ? 2 : 3}',
      '${{ for k in local.x : k => k }}',
      '${local.a + 1}',
      '${"open',
      '${unclosed',
      '${[1,}',
      '${{ a = 1 b }}',
      '${{ 1 = 2 }}',
      '${local.x.}',
      '${local.x[0}',
      '${f(1}',
      '${}',
      '${"${local.x"}',
      '${"\\u00e9"}',
      '${local # comment',
      '${local.a local.b}',
      '${[local.none]}',
      '${{ a = local.none }}',
    ]) {
      assert.equal(value(text).known, false, text)
    }
  })

  it('evaluates structures as a whole', () => {
    assert.deepEqual(value({ a: '${local.env.app.host}', b: [1, '${true}'] }).value, {
      a: 'a.example',
      b: [1, true],
    })
    assert.equal(value({ a: '${local.nothing}' }).known, false)
    assert.equal(value(3).value, 3)
  })
})

describe('shown', () => {
  it('unwraps a lone interpolation and keeps the rest as written', () => {
    assert.equal(shown('${ local.a }'), 'local.a')
    assert.equal(shown('a${local.a}'), 'a${local.a}')
    assert.equal(shown('${open'), '${open')
    assert.equal(shown([1]), '[\n  1\n]')
  })
})

describe('layoutGraph', () => {
  it('places each unit a column after what it depends on', () => {
    const { nodes, rounds, cycle, width, height } = layoutGraph(
      ['c', 'b', 'a', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
        { from: 'a', to: 'd' },
      ],
    )
    assert.deepEqual(rounds, [['a'], ['b', 'd'], ['c']])
    assert.deepEqual(cycle, [])
    assert.equal(nodes.a.column, 0)
    assert.equal(nodes.c.column, 2)
    assert.ok(nodes.b.x > nodes.a.x && nodes.c.x > nodes.b.x)
    assert.notEqual(nodes.b.y, nodes.d.y)
    assert.ok(width > nodes.c.x && height > Math.max(nodes.b.y, nodes.d.y))
  })

  it('routes an edge that skips a column through it, beside what stands there', () => {
    const { nodes, routes } = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    )
    assert.deepEqual(routes['a>b'], [])
    const [[x1, y1], [x2, y2]] = routes['a>c']
    assert.equal(x1, nodes.b.x)
    assert.equal(x2, nodes.b.x + nodes.b.width)
    assert.equal(y1, y2)
    assert.ok(y1 < nodes.b.y || y1 > nodes.b.y + nodes.b.height)
  })

  it('orders a column after the units feeding it', () => {
    const { nodes } = layoutGraph(
      ['x', 'y', 'p', 'q'],
      [
        { from: 'y', to: 'p' },
        { from: 'x', to: 'q' },
      ],
    )
    assert.ok(nodes.x.y < nodes.y.y)
    assert.ok(nodes.q.y < nodes.p.y)
  })

  it('places nothing', () => {
    const { nodes, rounds, width, height } = layoutGraph([], [])
    assert.deepEqual([nodes, rounds], [{}, []])
    assert.ok(width > 0 && height > 0)
  })

  it('names the units of a cycle and still places them', () => {
    const { nodes, cycle, rounds } = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    )
    assert.deepEqual(cycle, ['a', 'b'])
    assert.deepEqual(rounds, [['c'], ['a', 'b']])
    assert.equal(nodes.a.column, 1)
  })
})

describe('readStack', () => {
  it('reads the units, their values, inputs, modules and the edges between them', async () => {
    const root = repository(STACK)
    const stack = await readStack(join(root, 'infra/live/test'), { root })
    assert.equal(stack.environment, 'test')
    assert.equal(stack.file, 'infra/live/test/terragrunt.stack.hcl')
    assert.deepEqual(
      stack.units.map((unit) => unit.name),
      ['store', 'app', 'lone', 'elsewhere'],
    )
    const [store, app, lone, elsewhere] = stack.units

    assert.equal(store.description, 'The bucket,\nkept for a year.')
    assert.equal(store.unitDescription, 'A bucket. Values: name, size.')
    assert.equal(store.source, 'infra/units/store')
    assert.deepEqual(store.includes, [
      {
        name: 'root',
        file: 'infra/root.hcl',
        description: 'What every unit shares\nacross the environment.',
        inputs: ['region'],
        generates: ['provider.tf'],
      },
    ])
    assert.deepEqual(
      store.inputs.map(({ name, from, value }) => [name, from, value]),
      [
        ['region', 'root', 'fr-par'],
        ['extra', 'unit', 3],
        ['name', 'unit', 's'],
        ['size', 'unit', 1],
      ],
    )

    const values = Object.fromEntries(app.values.map((entry) => [entry.key, entry]))
    assert.deepEqual(values.host, {
      key: 'host',
      expression: 'local.host',
      known: true,
      value: 'a.example',
      overrides: [],
    })
    assert.deepEqual(values.branch.overrides, ['REF'])
    assert.equal(values.url.value, 'https://a.example')
    assert.deepEqual(values.tags.value, { a: ['fr-par', 2] })
    assert.equal(values.tags.expression, '{\n  "a": [\n    "${local.env.region}",\n    2\n  ]\n}')
    assert.equal(values.later.known, false)

    assert.equal(store.module.path, 'infra/modules/store')
    assert.equal(store.module.description, 'Makes the bucket.')
    assert.deepEqual(store.module.providers, [
      { name: 'thing', source: 'example/thing', version: '1.2.3' },
    ])
    assert.deepEqual(store.module.resources, [
      { kind: 'resource', address: 'thing.single', repeat: 'count = 1' },
      { kind: 'resource', address: 'thing.this', repeat: 'for_each = var.names' },
      { kind: 'data', address: 'data.lookup.zone', repeat: null },
      { kind: 'ephemeral', address: 'ephemeral.secret.token', repeat: null },
      { kind: 'module', address: 'module.nested', repeat: null },
    ])
    assert.deepEqual(store.module.variables[0], {
      name: 'name',
      type: 'string',
      description: "The bucket's name",
      required: true,
      default: null,
      sensitive: false,
      setBy: 'unit',
    })
    assert.equal(store.module.variables[1].setBy, null)
    assert.equal(store.module.variables[1].sensitive, true)
    assert.equal(store.module.variables[3].default, '1')
    assert.equal(app.module.variables[0].type, null)
    assert.deepEqual(store.module.outputs, [
      {
        name: 'bucket',
        description: 'The bucket',
        sensitive: false,
        consumers: [{ unit: 'app', input: 'bucket' }],
      },
      {
        name: 'endpoint',
        description: '',
        sensitive: true,
        consumers: [
          { unit: 'app', input: 'endpoint' },
          { unit: 'app', input: 'list[0]' },
        ],
      },
    ])

    assert.equal(app.module.path, 'infra/modules/app')
    assert.equal(app.module.description, '')
    assert.deepEqual(
      app.inputs.find((input) => input.name === 'files'),
      {
        name: 'files',
        from: 'stack',
        expression: '{\n  "bucket": "${dependency.store.outputs.gone}"\n}',
        known: false,
        value: null,
        overrides: [],
        outputs: [{ unit: 'store', output: 'gone', input: 'files.bucket' }],
      },
    )
    assert.deepEqual(
      app.includes.map(({ name, inputs, generates }) => [name, inputs, generates]),
      [
        ['extra', [], []],
        ['root', ['region'], ['provider.tf']],
      ],
    )

    assert.equal(lone.module, null)
    assert.equal(lone.moduleSource, 'git::https://example.invalid/lone.git')
    assert.equal(elsewhere.unitDescription, '')
    assert.equal(elsewhere.module, null)

    assert.deepEqual(stack.edges, [
      {
        from: 'store',
        to: 'app',
        kind: 'data',
        outputs: [
          { output: 'bucket', input: 'bucket', mock: 'mock' },
          { output: 'endpoint', input: 'endpoint', mock: null },
          { output: 'endpoint', input: 'list[0]', mock: null },
          { output: 'gone', input: 'files.bucket', mock: null },
        ],
      },
      { from: 'lone', to: 'app', kind: 'order', outputs: [] },
    ])
    assert.deepEqual(stack.rounds, [['store', 'lone', 'elsewhere'], ['app']])
    assert.ok(stack.layout.nodes.app.x > stack.layout.nodes.store.x)

    assert.deepEqual(store.warnings, [
      'The stack sets the value ignored, which the unit never reads.',
      'The input extra is no variable of the module.',
      'The module requires never_set, which no input sets.',
    ])
    assert.deepEqual(app.warnings, [
      'The stack sets the value later, which the unit never reads.',
      'The stack sets the value tags, which the unit never reads.',
      'The unit reads values.missing, which the stack does not set.',
      'The include missing finds no file.',
      'It reads the output gone of store, which that module does not declare.',
    ])
    assert.deepEqual(lone.warnings, ['The module is not in this repository.'])
    assert.deepEqual(elsewhere.warnings, ['The unit is not in this repository.'])
  })

  it('reports a dependency on a unit the stack does not hold', async () => {
    const root = repository({
      'infra/units/a/terragrunt.hcl': lines(
        '# Only a comment',
        'dependency "x" {',
        '  config_path = "../x"',
        '}',
      ),
      'infra/units/b/terragrunt.hcl': lines('# Comments', '# alone'),
      'infra/units/c/terragrunt.hcl': lines('terraform {', '  source = local.nowhere', '}'),
      'infra/live/e/terragrunt.stack.hcl': lines(
        'unit "a" {',
        '  source = "../../units/a"',
        '  path   = "a"',
        '',
        '  autoinclude {',
        '    dependencies {',
        '      paths = [unit.ghost.path]',
        '    }',
        '  }',
        '}',
        'unit "b" {',
        '  source = "../../units/b"',
        '  path   = "b"',
        '}',
        'unit "c" {',
        '  source = "../../units/c"',
        '  path   = "c"',
        '}',
      ),
    })
    const stack = await readStack(join(root, 'infra/live/e'), { root })
    assert.deepEqual(stack.edges, [])
    const [a, b, c] = stack.units
    assert.deepEqual(a.warnings, [
      'It depends on ../x, which is no unit of the stack.',
      'It depends on ${unit.ghost.path}, which is no unit of the stack.',
      'The unit has no terraform source.',
    ])
    assert.equal(a.unitDescription, 'Only a comment')
    assert.equal(b.unitDescription, 'Comments\nalone')
    assert.equal(c.moduleSource, 'local.nowhere')
    assert.deepEqual(c.warnings, ['The module is not in this repository.'])
  })

  it('reads a stack of no units', async () => {
    const root = repository({ 'infra/live/e/terragrunt.stack.hcl': 'locals {}\n' })
    const stack = await readStack(join(root, 'infra/live/e'), { root })
    assert.deepEqual([stack.units, stack.edges, stack.rounds], [[], [], []])
  })

  it('reports a cycle', async () => {
    const unit = (name, other) =>
      lines('dependencies {', `  paths = ["../${other}"]`, '}', '', `# ${name}`)
    const root = repository({
      'infra/units/a/terragrunt.hcl': unit('a', 'b'),
      'infra/units/b/terragrunt.hcl': unit('b', 'a'),
      'infra/live/e/terragrunt.stack.hcl': lines(
        'unit "a" {',
        '  source = "../../units/a"',
        '  path   = "a"',
        '}',
        'unit "b" {',
        '  source = "../../units/b"',
        '  path   = "b"',
        '}',
      ),
    })
    const stack = await readStack(join(root, 'infra/live/e'), { root })
    assert.deepEqual(stack.cycle, ['a', 'b'])
  })

  it('reads the stacks of this repository', async () => {
    const stack = await readStack(join(ROOT, 'infra/live/dev'), { root: ROOT })
    assert.deepEqual(stack.cycle, [])
    const names = stack.units.map((unit) => unit.name)
    assert.ok(names.includes('deployment') && names.includes('secrets'))
    for (const unit of stack.units) assert.ok(unit.module, `${unit.name} has a module`)
    const mail = stack.edges.find((edge) => edge.from === 'mail' && edge.to === 'deployment')
    assert.ok(mail.outputs.some((output) => output.input === 'smtp_host'))
    assert.deepEqual(
      stack.units.flatMap((unit) => unit.warnings.map((warning) => `${unit.name}: ${warning}`)),
      [],
    )
  })
})

describe('renderPage', () => {
  it('embeds the stack in the page so that no script ends early', () => {
    const page = renderPage({ name: '</script><b>' }, '<x>/*STACK*/</x>')
    assert.equal(page, '<x>{"name":"\\u003c/script>\\u003cb>"}</x>')
  })

  it('has a page that takes the stack', () => {
    const template = readFileSync(join(ROOT, 'scripts/deploy-graph.html'), 'utf8')
    assert.ok(template.includes('/*STACK*/'))
  })
})

describe('main', () => {
  const output = () => {
    const out = []
    return { out, log: (line) => out.push(line) }
  }

  it('writes the page of an environment beside its stack', async () => {
    const root = repository(STACK)
    const { out, log } = output()
    const code = await main(['test'], { root, log, error: log, env: {} })
    assert.equal(code, 0)
    const file = join(root, 'infra/live/test/.terragrunt-graph.html')
    const page = readFileSync(file, 'utf8')
    assert.ok(page.includes('"environment":"test"'))
    assert.ok(!page.includes('/*STACK*/'))
    assert.deepEqual(out, [file])
  })

  it('names the path a browser on Windows opens under WSL', async () => {
    const root = repository(STACK)
    const { out, log } = output()
    await main(['test'], { root, log, error: log, env: { WSL_DISTRO_NAME: 'Ubuntu' } })
    assert.equal(
      out[1],
      `file://wsl.localhost/Ubuntu${root}/infra/live/test/.terragrunt-graph.html`,
    )
  })

  it('names the environments when none or an unknown one is given', async () => {
    const root = repository(STACK)
    const { out, log } = output()
    assert.equal(await main([], { root, log, error: log, env: {} }), 2)
    assert.equal(await main(['prod'], { root, log, error: log, env: {} }), 2)
    assert.deepEqual(out, [
      'usage: pnpm deploy:graph <environment>, one of test',
      'usage: pnpm deploy:graph <environment>, one of test',
    ])
  })

  it('fails on a stack it cannot read', async () => {
    const root = repository({ 'infra/live/bad/terragrunt.stack.hcl': 'unit "a" {\n' })
    const { out, log } = output()
    assert.equal(await main(['bad'], { root, log, error: log, env: {} }), 1)
    assert.match(out[0], /^deploy:graph could not read the stack: /)
  })
})
