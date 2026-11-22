#!/usr/bin/env node
// pnpm deploy:graph <environment>: a page of an environment's stack, to open in a browser. It reads
// infra/live/<environment>/terragrunt.stack.hcl, its env.yaml, the units of infra/units and the
// modules of infra/modules as they stand in the checkout, and nothing else: no sign-in, no state,
// no plan. A value the files alone settle is shown resolved; one that needs a run (another unit's
// output, a secret, an expression beyond a reference) is shown as written. The page is written
// beside the stack as .terragrunt-graph.html, which git ignores.

import { parse as parseHcl } from '@cdktf/hcl2json'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'deploy-graph.html')
const PAGE = '.terragrunt-graph.html'

// ---------------------------------------------------------------------------------------------
// Expressions. hcl2json hands every expression back as a template string, `${...}` around it. The
// evaluator knows literals, references, indexes and the few functions a stack uses; anything else
// (operators, conditionals, for expressions) leaves the value unknown, never wrong.

class Unsupported extends Error {}

const unknown = { known: false }
const known = (value, overrides = []) => ({ known: true, value, overrides })

/** The index of the `}` closing the interpolation whose body starts at `start`. */
function interpolationEnd(text, start) {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (char === '"') index = stringEnd(text, index + 1)
    else if (char === '{') depth++
    else if (char === '}') {
      if (depth === 0) return index
      depth--
    }
  }
  throw new Unsupported('an interpolation is not closed')
}

/** The index of the `"` closing the string whose body starts at `start`. */
function stringEnd(text, start) {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') index++
    else if (text[index] === '"') return index
    else if (text.startsWith('${', index)) index = interpolationEnd(text, index + 2)
  }
  throw new Unsupported('a string is not closed')
}

/** The literal and interpolated parts of a template's body. */
function templateParts(text) {
  const parts = []
  let literal = ''
  for (let index = 0; index < text.length; index++) {
    if (text.startsWith('$${', index)) {
      literal += '${'
      index += 2
    } else if (text.startsWith('${', index)) {
      const end = interpolationEnd(text, index + 2)
      parts.push(literal, { expression: text.slice(index + 2, end) })
      literal = ''
      index = end
    } else {
      literal += text[index]
    }
  }
  parts.push(literal)
  return parts.filter((part) => part !== '')
}

const ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t' }

/** The tokens of an expression: numbers, names, strings (as raw template bodies) and punctuation. */
function tokenize(text) {
  const tokens = []
  for (let index = 0; index < text.length;) {
    const char = text[index]
    if (/\s/.test(char)) {
      index++
    } else if (/[0-9]/.test(char)) {
      const [number] = text.slice(index).match(/^[0-9]+(\.[0-9]+)?/)
      tokens.push({ type: 'number', value: Number(number) })
      index += number.length
    } else if (/[A-Za-z_]/.test(char)) {
      const [name] = text.slice(index).match(/^[A-Za-z_][\w-]*/)
      tokens.push({ type: 'name', value: name })
      index += name.length
    } else if (char === '"') {
      const end = stringEnd(text, index + 1)
      tokens.push({ type: 'string', value: text.slice(index + 1, end) })
      index = end + 1
    } else if ('()[]{},.=:'.includes(char)) {
      tokens.push({ type: char })
      index++
    } else {
      throw new Unsupported(`${char} is not supported`)
    }
  }
  return tokens
}

/** The syntax tree of an expression, or Unsupported. */
function parseExpression(text) {
  const tokens = tokenize(text)
  let position = 0
  const peek = () => tokens[position]?.type
  const take = (type) => {
    if (peek() !== type) throw new Unsupported(`${type} expected`)
    return tokens[position++]
  }
  const list = (close, item) => {
    const items = []
    while (peek() !== close) {
      items.push(item())
      if (peek() === ',') take(',')
      else break
    }
    take(close)
    return items
  }

  function primary() {
    const token = tokens[position++]
    switch (token?.type) {
      case 'number':
        return { type: 'literal', value: token.value }
      case 'string':
        return { type: 'template', parts: templateParts(unescape(token.value)) }
      case 'name':
        if (token.value === 'true' || token.value === 'false' || token.value === 'null') {
          return { type: 'literal', value: JSON.parse(token.value) }
        }
        if (peek() === '(') {
          take('(')
          return { type: 'call', name: token.value, args: list(')', expression) }
        }
        return { type: 'reference', name: token.value }
      case '[':
        return { type: 'tuple', items: list(']', expression) }
      case '{':
        return { type: 'object', entries: list('}', entry) }
      case '(': {
        const inner = expression()
        take(')')
        return inner
      }
      default:
        throw new Unsupported('an expression expected')
    }
  }

  function entry() {
    const key = tokens[position++]
    if (key?.type !== 'name' && key?.type !== 'string') throw new Unsupported('a key expected')
    if (peek() === ':') take(':')
    else take('=')
    return [key.value, expression()]
  }

  function expression() {
    let node = primary()
    for (;;) {
      if (peek() === '.') {
        take('.')
        node = { type: 'index', of: node, key: { type: 'literal', value: take('name').value } }
      } else if (peek() === '[') {
        take('[')
        node = { type: 'index', of: node, key: expression() }
        take(']')
      } else {
        return node
      }
    }
  }

  const node = expression()
  if (position < tokens.length) throw new Unsupported('the expression goes on')
  return node
}

/** A string literal's body with its escapes resolved, interpolations kept. */
function unescape(body) {
  return body.replace(/\\(.)/g, (_, char) => {
    if (!Object.hasOwn(ESCAPES, char)) throw new Unsupported(`\\${char} is not supported`)
    return ESCAPES[char]
  })
}

/** The file named `name` in `from` or the nearest directory above it within `root`. */
function findUp(name, from, root) {
  let dir = from
  while (!existsSync(join(dir, name))) {
    if (dir === root || dir === dirname(dir)) return undefined
    dir = dirname(dir)
  }
  return join(dir, name)
}

/** Every argument known: their values, else undefined. */
function allKnown(results) {
  if (!results.every((result) => result.known)) return undefined
  return {
    values: results.map((result) => result.value),
    overrides: results.flatMap((result) => result.overrides),
  }
}

const FUNCTIONS = {
  get_repo_root: (_, context) => known(context.root),
  find_in_parent_folders: ([name], context) => {
    const found = findUp(name, context.from, context.root)
    return found === undefined ? unknown : known(found)
  },
  file: ([path], context) => {
    try {
      return known(readFileSync(resolve(context.from, path), 'utf8'))
    } catch {
      return unknown
    }
  },
  yamldecode: ([text]) => known(parseYaml(text)),
  split: ([separator, text]) => known(text.split(separator)),
  trimsuffix: ([text, suffix]) =>
    known(text.endsWith(suffix) ? text.slice(0, -suffix.length) : text),
  replace: ([text, search, replacement]) => known(text.replaceAll(search, replacement)),
}

function evaluateNode(node, context) {
  switch (node.type) {
    case 'literal':
      return known(node.value)
    case 'template':
      return evaluateTemplate(node.parts, context)
    case 'reference':
      return Object.hasOwn(context.scope, node.name) ? known(context.scope[node.name]) : unknown
    case 'index': {
      const both = allKnown([evaluateNode(node.of, context), evaluateNode(node.key, context)])
      if (!both) return unknown
      const [of, key] = both.values
      if (of === null || typeof of !== 'object' || !Object.hasOwn(of, key)) return unknown
      return known(of[key], both.overrides)
    }
    case 'tuple': {
      const items = allKnown(node.items.map((item) => evaluateNode(item, context)))
      return items ? known(items.values, items.overrides) : unknown
    }
    case 'object': {
      const values = allKnown(node.entries.map(([, value]) => evaluateNode(value, context)))
      if (!values) return unknown
      const object = Object.fromEntries(
        node.entries.map(([key], index) => [key, values.values[index]]),
      )
      return known(object, values.overrides)
    }
    default:
      return evaluateCall(node, context)
  }
}

function evaluateCall({ name, args }, context) {
  if (name === 'try') {
    for (const arg of args) {
      const result = evaluateNode(arg, context)
      if (result.known) return result
    }
    return unknown
  }
  if (name === 'get_env') {
    const variable = evaluateNode(args[0], context)
    if (!variable.known || args.length < 2) return unknown
    const fallback = evaluateNode(args[1], context)
    return fallback.known ? known(fallback.value, [...fallback.overrides, variable.value]) : unknown
  }
  if (!Object.hasOwn(FUNCTIONS, name)) return unknown
  const given = allKnown(args.map((arg) => evaluateNode(arg, context)))
  if (!given) return unknown
  const result = FUNCTIONS[name](given.values, context)
  return result.known ? known(result.value, given.overrides) : unknown
}

function evaluateTemplate(parts, context) {
  // A template of one interpolation is that expression's value, of whatever type
  if (parts.length === 1 && typeof parts[0] !== 'string') {
    return evaluateNode(parseExpression(parts[0].expression), context)
  }
  let text = ''
  const overrides = []
  for (const part of parts) {
    if (typeof part === 'string') {
      text += part
      continue
    }
    const result = evaluateNode(parseExpression(part.expression), context)
    if (!result.known || (result.value !== null && typeof result.value === 'object')) return unknown
    text += String(result.value)
    overrides.push(...result.overrides)
  }
  return known(text, overrides)
}

/**
 * The value of what hcl2json gives for an expression: a template string, or a structure of them.
 * `context` holds the `scope` of names, the repository's `root` and the directory to evaluate
 * `from`. The result is `{ known, value, overrides }`, overrides naming the environment variables
 * that can replace the value.
 */
export function evaluate(json, context) {
  if (typeof json === 'string') {
    // What it cannot read, or a function that fails on what it is given, leaves the value unknown
    try {
      return evaluateTemplate(templateParts(json), context)
    } catch {
      return unknown
    }
  }
  if (json === null || typeof json !== 'object') return known(json)
  const entries = Object.entries(json)
  const values = allKnown(entries.map(([, value]) => evaluate(value, context)))
  if (!values) return unknown
  const result = entries.map(([key], index) => [key, values.values[index]])
  return known(
    Array.isArray(json) ? result.map(([, value]) => value) : Object.fromEntries(result),
    values.overrides,
  )
}

/** How an expression reads in the page: a lone interpolation unwrapped, a structure as JSON. */
export function shown(json) {
  if (typeof json !== 'string') return JSON.stringify(json, null, 2)
  let parts
  try {
    parts = templateParts(json)
  } catch {
    return json
  }
  return parts.length === 1 && typeof parts[0] !== 'string' ? parts[0].expression.trim() : json
}

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
  return {
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
  }
  const local = evaluateLocals(parsed, { ...evaluation, scope: { values: knownValues } })
  inputs.push(
    ...inputsOf(parsed.inputs ?? {}, 'unit', {
      ...evaluation,
      scope: { values: knownValues, local },
    }),
  )
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
  unit.module = await readModule(moduleDir, root)
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
      return {
        name,
        from,
        expression: shown(block[name]),
        known: result.known,
        value: result.known ? result.value : null,
        overrides: result.known ? result.overrides : [],
        // Each output of a dependency it reads, by the dependency's name until the edges are known
        reads: dependencyOutputs(block[name], name),
      }
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
// Layout

const NODE = { width: 220, height: 92, columnGap: 120, rowGap: 36, margin: 32, passage: 18 }

/**
 * Columns and positions for `names` under `edges` ({ from, to }, `from` applied first): a unit
 * sits one column after the last of what it depends on. An edge that skips columns passes each of
 * them through a slot of its own, so that it runs beside the units there rather than behind them;
 * `routes` holds, by `from>to`, the two ends of each such slot. Units and slots are ordered within
 * their column by the rows of what they connect to, a few sweeps each way. `rounds` are the
 * columns in the order of `names`, the order Terragrunt can apply them in; units on a cycle are
 * named in `cycle` and put in a last column.
 */
export function layoutGraph(names, edges) {
  const before = new Map(names.map((name) => [name, []]))
  for (const { from, to } of edges) before.get(to).push(from)
  const column = new Map()
  let placed = true
  while (placed) {
    placed = false
    for (const name of names) {
      if (column.has(name) || !before.get(name).every((other) => column.has(other))) continue
      column.set(name, Math.max(-1, ...before.get(name).map((other) => column.get(other))) + 1)
      placed = true
    }
  }
  const cycle = names.filter((name) => !column.has(name))
  const last = Math.max(-1, ...column.values()) + 1
  for (const name of cycle) column.set(name, last)

  const columns = []
  for (const name of names) (columns[column.get(name)] ??= []).push(name)
  const rounds = columns.map((members) => [...members])

  // The slots of the edges that skip columns, and the links between neighbouring columns
  const links = []
  const passages = {}
  const slots = new Set()
  for (const { from, to } of edges) {
    const key = `${from}>${to}`
    passages[key] = []
    let previous = from
    for (let index = column.get(from) + 1; index < column.get(to); index++) {
      const slot = `${key}#${index}`
      column.set(slot, index)
      columns[index].push(slot)
      slots.add(slot)
      passages[key].push(slot)
      links.push([previous, slot])
      previous = slot
    }
    if (column.get(previous) < column.get(to)) links.push([previous, to])
  }

  const row = new Map()
  const number = () =>
    columns.forEach((members) => members.forEach((id, index) => row.set(id, index)))
  const sweep = (members, neighbours) => {
    const order = members.map((id, index) => {
      const rows = neighbours(id).map((other) => row.get(other))
      const centre = rows.length === 0 ? index : rows.reduce((a, b) => a + b, 0) / rows.length
      return { id, index, centre }
    })
    order.sort((a, b) => a.centre - b.centre || a.index - b.index)
    members.splice(0, members.length, ...order.map(({ id }) => id))
    number()
  }
  const previousOf = (id) => links.filter(([, to]) => to === id).map(([from]) => from)
  const nextOf = (id) => links.filter(([from]) => from === id).map(([, to]) => to)
  number()
  for (let pass = 0; pass < 4; pass++) {
    for (const members of columns.slice(1)) sweep(members, previousOf)
    for (const members of columns.slice(0, -1).reverse()) sweep(members, nextOf)
  }
  for (const members of columns.slice(1)) sweep(members, previousOf)

  // Positions: a column's units and slots stacked, every column centred on the tallest
  const size = (id) => (slots.has(id) ? NODE.passage : NODE.height)
  const heightOf = (members) =>
    members.reduce((sum, id) => sum + size(id), 0) + Math.max(0, members.length - 1) * NODE.rowGap
  const tallest = Math.max(0, ...columns.map(heightOf))
  const nodes = {}
  const middle = new Map()
  columns.forEach((members, index) => {
    const x = NODE.margin + index * (NODE.width + NODE.columnGap)
    let y = NODE.margin + (tallest - heightOf(members)) / 2
    for (const id of members) {
      if (!slots.has(id)) {
        nodes[id] = { column: index, x, y, width: NODE.width, height: NODE.height }
      }
      middle.set(id, [x, y + size(id) / 2])
      y += size(id) + NODE.rowGap
    }
  })
  const routes = Object.fromEntries(
    Object.entries(passages).map(([key, through]) => [
      key,
      through.flatMap((slot) => {
        const [x, y] = middle.get(slot)
        return [
          [x, y],
          [x + NODE.width, y],
        ]
      }),
    ]),
  )
  return {
    nodes,
    routes,
    rounds,
    cycle,
    width:
      NODE.margin * 2 +
      columns.length * NODE.width +
      Math.max(0, columns.length - 1) * NODE.columnGap,
    height: NODE.margin * 2 + tallest,
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
  }
}

/** The page with the stack in it, `<` escaped so that nothing in the data closes its script. */
export function renderPage(stack, template) {
  return template.split('/*STACK*/').join(JSON.stringify(stack).replaceAll('<', '\\u003c'))
}

/** Writes the page of the environment named in `args`; the exit status. */
export async function main(
  args,
  { root = ROOT, log = console.log, error = console.error, env = process.env } = {},
) {
  const live = join(root, 'infra/live')
  const environments = readdirSync(live)
    .filter((name) => existsSync(join(live, name, 'terragrunt.stack.hcl')))
    .sort()
  const [name] = args
  if (!environments.includes(name)) {
    error(`usage: pnpm deploy:graph <environment>, one of ${environments.join(', ')}`)
    return 2
  }
  let stack
  try {
    stack = await readStack(join(live, name), { root })
  } catch (failure) {
    error(`deploy:graph could not read the stack: ${failure.message}`)
    return 1
  }
  const page = join(live, name, PAGE)
  writeFileSync(page, renderPage(stack, readFileSync(TEMPLATE, 'utf8')))
  log(page)
  // A browser on Windows opens a file of the WSL distribution by this address
  if (env.WSL_DISTRO_NAME) log(`file://wsl.localhost/${env.WSL_DISTRO_NAME}${page}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
