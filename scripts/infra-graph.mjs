#!/usr/bin/env node
// pnpm infra:graph <environment> [--open]: a page of an environment's stack, to open in a
// browser, of the deployment (scripts/infra-graph-deployment.mjs) and of the code. It reads
// infra/live/<environment>/terragrunt.stack.hcl, its env.yaml, the units of infra/units and the
// modules of infra/modules as they stand in the checkout, and nothing else: no sign-in, no state,
// no plan. A value the files alone settle is shown resolved; one that needs a run (another unit's
// output, a secret, an expression beyond a reference) is shown as written. The page is written
// beside the stack as .terragrunt-graph.html, which git ignores; --open opens it in the default
// browser.

import { parse as parseHcl } from '@cdktf/hcl2json'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readDeployment } from './infra-graph-deployment.mjs'
import { evaluate, shown } from './hcl.mjs'
import { layoutGraph } from './layout.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'infra-graph.html')
const PAGE = '.terragrunt-graph.html'

/** The locals of a parsed file, evaluated in order of need; those that never resolve stay out. */
function evaluateLocals(parsed, context) {
  const pending = Object.assign({}, ...(parsed.locals ?? []))
  const local = {}
  let progress = true
  while (progress) {
    progress = false
    for (const [name, json] of Object.entries(pending)) {
      const result = evaluate(json, { ...context, scope: { ...context.scope, local } })
      if (!result.known) continue
      local[name] = result.value
      delete pending[name]
      progress = true
    }
  }
  return local
}

// ---------------------------------------------------------------------------------------------
// Files

async function readHcl(path) {
  const text = readFileSync(path, 'utf8')
  return { text, parsed: await parseHcl(path, text) }
}

/** The comment lines right above `line` (an index into `lines`), without their `#`. */
function commentAbove(lines, line) {
  const comment = []
  for (let index = line - 1; index >= 0 && /^\s*(#|\/\/)/.test(lines[index]); index--) {
    comment.unshift(lines[index].replace(/^\s*(#|\/\/)\s?/, ''))
  }
  return comment.join('\n')
}

/** The comment a file opens with. */
function headerComment(text) {
  // A line closes the text, so that a file of comments alone still ends
  const lines = `${text}\n`.split('\n')
  return commentAbove(
    lines,
    lines.findIndex((line) => !/^\s*(#|\/\/)/.test(line)),
  )
}

const first = (blocks) => (blocks ?? [])[0] ?? {}

/** Each `${dependency.<name>.outputs.<output>}` in `json`, with the input path it sits at. */
function dependencyOutputs(json, path) {
  if (typeof json === 'string') {
    return [...json.matchAll(/dependency\.([\w-]+)\.outputs\.([\w-]+)/g)].map(
      ([, name, output]) => ({
        name,
        output,
        input: path,
      }),
    )
  }
  if (json === null || typeof json !== 'object') return []
  return Object.entries(json).flatMap(([key, value]) =>
    dependencyOutputs(value, Array.isArray(json) ? `${path}[${key}]` : `${path}.${key}`),
  )
}

/** The variables, outputs, resources and providers of the module in `dir`. */
async function readModule(dir, root) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.tf'))
    .sort()
  const merged = {
    variable: {},
    output: {},
    resource: {},
    data: {},
    ephemeral: {},
    module: {},
    locals: {},
    providers: [],
  }
  for (const name of files) {
    const { parsed } = await readHcl(join(dir, name))
    for (const kind of ['variable', 'output', 'resource', 'data', 'ephemeral', 'module']) {
      for (const [key, value] of Object.entries(parsed[kind] ?? {})) {
        merged[kind][key] =
          kind === 'resource' || kind === 'data' || kind === 'ephemeral'
            ? { ...merged[kind][key], ...value }
            : value
      }
    }
    Object.assign(merged.locals, ...(parsed.locals ?? []))
    for (const terraform of parsed.terraform ?? []) {
      for (const providers of terraform.required_providers ?? []) {
        for (const [provider, { source, version }] of Object.entries(providers)) {
          merged.providers.push({ name: provider, source, version })
        }
      }
    }
  }
  const main = join(dir, 'main.tf')
  const repeat = (block) => {
    for (const key of ['for_each', 'count'])
      if (key in block) return `${key} = ${shown(block[key])}`
    return null
  }
  const resources = []
  for (const kind of ['resource', 'data', 'ephemeral']) {
    const prefix = kind === 'resource' ? '' : `${kind}.`
    for (const type of Object.keys(merged[kind]).sort()) {
      for (const name of Object.keys(merged[kind][type]).sort()) {
        resources.push({
          kind,
          address: `${prefix}${type}.${name}`,
          repeat: repeat(first(merged[kind][type][name])),
        })
      }
    }
  }
  for (const name of Object.keys(merged.module).sort()) {
    resources.push({
      kind: 'module',
      address: `module.${name}`,
      repeat: repeat(first(merged.module[name])),
    })
  }
  const sorted = (kind) => Object.entries(merged[kind]).sort(([a], [b]) => a.localeCompare(b))
  const summary = {
    path: relative(root, dir),
    description: existsSync(main) ? headerComment(readFileSync(main, 'utf8')) : '',
    providers: merged.providers.sort((a, b) => a.name.localeCompare(b.name)),
    resources,
    variables: sorted('variable').map(([name, blocks]) => {
      const block = first(blocks)
      return {
        name,
        type: 'type' in block ? shown(block.type) : null,
        description: block.description ?? '',
        required: !('default' in block),
        default: 'default' in block ? shown(block.default) : null,
        sensitive: block.sensitive === true,
        setBy: null,
      }
    }),
    outputs: sorted('output').map(([name, blocks]) => ({
      name,
      description: first(blocks).description ?? '',
      sensitive: first(blocks).sensitive === true,
      consumers: [],
    })),
  }
  return { summary, blocks: merged }
}

/** A unit of the stack: its file, includes, values, inputs, dependencies and module. */
async function readUnit(block, name, context) {
  const { stackDir, root, scope, description } = context
  const generated = join(stackDir, '.terragrunt-stack', block.path)
  const warnings = []
  const unit = {
    name,
    path: block.path,
    description,
    unitDescription: '',
    source: block.source,
    values: [],
    includes: [],
    inputs: [],
    dependencies: [],
    moduleSource: null,
    module: null,
    warnings,
  }
  // What the deployment view evaluates, kept out of the page
  const internal = {
    blocks: null,
    moduleDir: null,
    inputs: [],
    dependencyUnits: new Map(),
    generates: [],
  }
  Object.defineProperty(unit, 'internal', { value: internal })
  const generates = (blocks, context) => {
    for (const list of Object.values(blocks ?? {})) {
      const contents = evaluate(first(list).contents, context)
      if (contents.known) internal.generates.push(String(contents.value))
    }
  }

  const valueContext = { scope, root, from: stackDir }
  const knownValues = {}
  for (const key of Object.keys(block.values ?? {}).sort()) {
    const result = evaluate(block.values[key], valueContext)
    if (result.known) knownValues[key] = result.value
    unit.values.push({
      key,
      expression: shown(block.values[key]),
      known: result.known,
      value: result.known ? result.value : null,
      overrides: result.known ? result.overrides : [],
    })
  }

  const sourceDir = resolve(stackDir, block.source)
  const file = join(sourceDir, 'terragrunt.hcl')
  const autoinclude = first(block.autoinclude)
  if (!existsSync(file)) {
    warnings.push('The unit is not in this repository.')
    collectDependencies(unit, autoinclude, { ...context, from: generated })
    return unit
  }
  unit.source = relative(root, sourceDir)
  const { text, parsed } = await readHcl(file)
  unit.unitDescription = headerComment(text)

  // Values the stack sets and the unit never reads, and the reverse
  const read = new Set([...text.matchAll(/values\.([A-Za-z_][\w-]*)/g)].map(([, key]) => key))
  for (const { key } of unit.values) {
    if (!read.has(key))
      warnings.push(`The stack sets the value ${key}, which the unit never reads.`)
  }
  for (const key of [...read].sort()) {
    const guarded = new RegExp(`try\\(\\s*values\\.${key}\\b`).test(text)
    if (
      !Object.hasOwn(knownValues, key) &&
      !unit.values.some((value) => value.key === key) &&
      !guarded
    ) {
      warnings.push(`The unit reads values.${key}, which the stack does not set.`)
    }
  }

  const evaluation = { root, from: generated }
  const inputs = []
  for (const [label, blocks] of Object.entries(parsed.include ?? {})) {
    const found = evaluate(first(blocks).path, { ...evaluation, scope: {} })
    if (!found.known) {
      warnings.push(`The include ${label} finds no file.`)
      continue
    }
    const included = await readHcl(found.value)
    const local = evaluateLocals(included.parsed, { ...evaluation, scope: {} })
    const includeInputs = included.parsed.inputs ?? {}
    unit.includes.push({
      name: label,
      file: relative(root, found.value),
      description: headerComment(included.text),
      inputs: Object.keys(includeInputs).sort(),
      generates: Object.values(included.parsed.generate ?? {}).map((blocks) => first(blocks).path),
    })
    inputs.push(...inputsOf(includeInputs, label, { ...evaluation, scope: { local } }))
    generates(included.parsed.generate, { ...evaluation, scope: { local } })
  }
  const local = evaluateLocals(parsed, { ...evaluation, scope: { values: knownValues } })
  inputs.push(
    ...inputsOf(parsed.inputs ?? {}, 'unit', {
      ...evaluation,
      scope: { values: knownValues, local },
    }),
  )
  generates(parsed.generate, { ...evaluation, scope: { values: knownValues, local } })
  inputs.push(...inputsOf(autoinclude.inputs ?? {}, 'stack', { ...evaluation, scope: {} }))
  // A later source of an input replaces an earlier one, as Terragrunt merges them
  unit.inputs = inputs.filter(
    (input, index) => !inputs.slice(index + 1).some((later) => later.name === input.name),
  )

  // The autoinclude is written into the generated unit, so its paths too are relative to it
  collectDependencies(unit, parsed, { ...context, from: generated })
  collectDependencies(unit, autoinclude, { ...context, from: generated })

  const terraform = first(parsed.terraform)
  if (!('source' in terraform)) {
    warnings.push('The unit has no terraform source.')
    return unit
  }
  const moduleSource = evaluate(terraform.source, { ...evaluation, scope: {} })
  unit.moduleSource = moduleSource.known ? moduleSource.value : shown(terraform.source)
  const moduleDir =
    moduleSource.known && !moduleSource.value.includes('::')
      ? resolve(sourceDir, moduleSource.value)
      : null
  if (moduleDir === null || !existsSync(moduleDir)) {
    warnings.push('The module is not in this repository.')
    return unit
  }
  const { summary, blocks } = await readModule(moduleDir, root)
  unit.module = summary
  Object.assign(internal, { blocks, moduleDir, inputs: unit.inputs })
  for (const input of unit.inputs) {
    const variable = unit.module.variables.find((candidate) => candidate.name === input.name)
    if (variable) variable.setBy = input.from
    else warnings.push(`The input ${input.name} is no variable of the module.`)
  }
  for (const variable of unit.module.variables) {
    if (variable.required && variable.setBy === null) {
      warnings.push(`The module requires ${variable.name}, which no input sets.`)
    }
  }
  return unit
}

/** The inputs of an `inputs` block, each with where it comes from and what it reads of others. */
function inputsOf(block, from, context) {
  return Object.keys(block)
    .sort()
    .map((name) => {
      const result = evaluate(block[name], context)
      const input = {
        name,
        from,
        expression: shown(block[name]),
        known: result.known,
        value: result.known ? result.value : null,
        overrides: result.known ? result.overrides : [],
        // Each output of a dependency it reads, by the dependency's name until the edges are known
        reads: dependencyOutputs(block[name], name),
      }
      // The input as written, for the deployment view to evaluate with the outputs it reads
      Object.defineProperty(input, 'raw', { value: { json: block[name], context } })
      return input
    })
}

/**
 * The dependencies a block of the unit's file or of its autoinclude names, keyed by the unit they
 * point at: `dependency` blocks carry outputs, `dependencies` only order.
 */
function collectDependencies(unit, block, context) {
  const { byPath, stackDir, from: unitDir } = context
  const target = (configPath) => {
    const match = /^\$\{unit\.([\w-]+)\.path\}$/.exec(configPath)
    if (match) return context.byName.has(match[1]) ? match[1] : null
    const path = relative(join(stackDir, '.terragrunt-stack'), resolve(unitDir, configPath))
    return byPath.get(path) ?? null
  }
  const add = (configPath, name, mocks) => {
    const from = target(configPath)
    if (from === null) {
      unit.warnings.push(`It depends on ${configPath}, which is no unit of the stack.`)
      return
    }
    let dependency = unit.dependencies.find((candidate) => candidate.unit === from)
    if (!dependency) {
      dependency = { unit: from, names: [], mocks: {} }
      unit.dependencies.push(dependency)
    }
    if (name !== null) dependency.names.push(name)
    Object.assign(dependency.mocks, mocks)
  }
  for (const { paths = [] } of block.dependencies ?? []) {
    for (const path of paths) add(path, null, {})
  }
  for (const [name, blocks] of Object.entries(block.dependency ?? {})) {
    const { config_path: configPath, mock_outputs: mocks = {} } = first(blocks)
    add(configPath, name, mocks)
  }
}

// ---------------------------------------------------------------------------------------------
// The stack

/** Everything the page shows of the stack in `stackDir`. */
export async function readStack(stackDir, { root = ROOT } = {}) {
  const file = join(stackDir, 'terragrunt.stack.hcl')
  const { text, parsed } = await readHcl(file)
  const lines = text.split('\n')
  const local = evaluateLocals(parsed, { scope: {}, root, from: stackDir })

  // hcl2json sorts the blocks by name; the page keeps the order of the file
  const position = new Map()
  lines.forEach((line, index) => {
    const match = /^\s*unit\s+"([^"]+)"/.exec(line)
    if (match) position.set(match[1], index)
  })
  const blocks = Object.entries(parsed.unit ?? {}).sort(
    ([a], [b]) => position.get(a) - position.get(b),
  )
  const byName = new Map(blocks.map(([name, list]) => [name, first(list)]))
  const byPath = new Map(blocks.map(([name, list]) => [first(list).path, name]))

  const units = []
  for (const [name, list] of blocks) {
    units.push(
      await readUnit(first(list), name, {
        stackDir,
        root,
        scope: { local },
        description: commentAbove(lines, position.get(name)),
        byName,
        byPath,
      }),
    )
  }

  const edges = []
  for (const unit of units) {
    for (const dependency of unit.dependencies) {
      for (const name of dependency.names) unit.internal.dependencyUnits.set(name, dependency.unit)
      const source = units.find((candidate) => candidate.name === dependency.unit)
      const outputs = unit.inputs
        .flatMap((input) => input.reads)
        .filter((read) => dependency.names.includes(read.name))
        .map(({ output, input }) => ({
          output,
          input,
          mock: Object.hasOwn(dependency.mocks, output) ? dependency.mocks[output] : null,
        }))
        .sort((a, b) => a.output.localeCompare(b.output) || a.input.localeCompare(b.input))
      for (const { output, input } of outputs) {
        const declared = source.module?.outputs.find((candidate) => candidate.name === output)
        if (declared) declared.consumers.push({ unit: unit.name, input })
        else if (source.module) {
          unit.warnings.push(
            `It reads the output ${output} of ${source.name}, which that module does not declare.`,
          )
        }
      }
      edges.push({
        from: dependency.unit,
        to: unit.name,
        kind: outputs.length > 0 ? 'data' : 'order',
        outputs,
      })
    }
  }
  // The outputs each input reads, by the unit that makes them
  for (const unit of units) {
    for (const input of unit.inputs) {
      input.outputs = edges
        .filter((edge) => edge.to === unit.name)
        .flatMap((edge) =>
          edge.outputs
            .filter((output) =>
              input.reads.some(
                (read) => read.input === output.input && read.output === output.output,
              ),
            )
            .map(({ output, input: at }) => ({ unit: edge.from, output, input: at })),
        )
      delete input.reads
    }
    delete unit.dependencies
  }

  const order = (name) => units.findIndex((unit) => unit.name === name)
  edges.sort((a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to))
  const layout = layoutGraph(
    units.map((unit) => unit.name),
    edges,
  )
  return {
    environment: relative(join(root, 'infra/live'), stackDir),
    file: relative(root, file),
    units,
    edges,
    rounds: layout.rounds,
    cycle: layout.cycle,
    layout,
    deployment: readDeployment(units, { root }),
  }
}

/** The page with the stack in it, `<` escaped so that nothing in the data closes its script. */
export function renderPage(stack, template) {
  return template.split('/*STACK*/').join(JSON.stringify(stack).replaceAll('<', '\\u003c'))
}

/** The command that opens `page` in the default browser. */
function opener(page, { env, platform }) {
  // Under WSL the browser is Windows': explorer.exe opens the file through the distribution's share
  if (env.WSL_DISTRO_NAME) {
    return [
      'explorer.exe',
      [`\\\\wsl.localhost\\${env.WSL_DISTRO_NAME}${page.replaceAll('/', '\\')}`],
    ]
  }
  return [platform === 'darwin' ? 'open' : 'xdg-open', [page]]
}

/**
 * Writes the page of the environment named in `args`, and opens it with `--open`; the exit status.
 * A page that does not open is still written: the failure is told, not returned.
 */
export async function main(
  args,
  {
    root = ROOT,
    log = console.log,
    error = console.error,
    env = process.env,
    spawn = spawnSync,
    platform = process.platform,
  } = {},
) {
  const live = join(root, 'infra/live')
  const environments = readdirSync(live)
    .filter((name) => existsSync(join(live, name, 'terragrunt.stack.hcl')))
    .sort()
  const usage = () => {
    error(`usage: pnpm infra:graph <environment> [--open], one of ${environments.join(', ')}`)
    return 2
  }
  let parsed
  try {
    parsed = parseArgs({ args, options: { open: { type: 'boolean' } }, allowPositionals: true })
  } catch {
    return usage()
  }
  const [name] = parsed.positionals
  if (!environments.includes(name)) return usage()
  let stack
  try {
    stack = await readStack(join(live, name), { root })
  } catch (failure) {
    error(`infra:graph could not read the stack: ${failure.message}`)
    return 1
  }
  const page = join(live, name, PAGE)
  writeFileSync(page, renderPage(stack, readFileSync(TEMPLATE, 'utf8')))
  log(page)
  // A browser on Windows opens a file of the WSL distribution by this address
  if (env.WSL_DISTRO_NAME) log(`file://wsl.localhost/${env.WSL_DISTRO_NAME}${page}`)
  if (parsed.values.open) {
    const [command, commandArgs] = opener(page, { env, platform })
    // Only a command that did not start failed: explorer.exe exits with 1 when it opened the file
    const result = spawn(command, commandArgs, { stdio: 'ignore' })
    if (result.error) {
      error(
        `infra:graph could not open the page (${result.error.message}): open it in a browser yourself.`,
      )
    }
  }
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
