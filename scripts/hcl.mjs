// The HCL expressions of Terragrunt and OpenTofu files as hcl2json hands them back: every
// expression a template string, `${...}` around it, inside a structure of plain JSON. The
// evaluator knows what the infrastructure code of this repository writes: literals, references,
// operators, conditionals, for expressions and the functions below. What it cannot evaluate leaves
// the value unknown, never wrong. A value only a run knows (a secret, an attribute a provider
// computes, another unit's output) is an Opaque, which flows through templates and through the
// functions that only reshape it, so that an address that holds a secret still shows where it
// leads. Used by scripts/deploy-graph.mjs and scripts/deploy-layout.mjs.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** A value only a run knows, named by `label`; `instance` is the resource it is an attribute of. */
export class Opaque {
  constructor(label, instance = null) {
    this.label = label
    this.instance = instance
  }

  toJSON() {
    return `‹${this.label}›`
  }

  toString() {
    return `‹${this.label}›`
  }
}

/** A resource or data source: `get(attribute)` its value, or undefined when only a run knows it. */
export class Instance {
  constructor(label, get) {
    this.label = label
    this.get = get
  }
}

/** An object whose `keys` are evaluated only when read, by `get(key)`. */
export class Lazy {
  constructor(keys, get) {
    this.keys = new Set(keys)
    this.read = get
    this.values = new Map()
  }

  get(key) {
    if (!this.keys.has(key)) fail(`${key} is not set`)
    if (!this.values.has(key)) this.values.set(key, this.read(key))
    return this.values.get(key)
  }
}

class Unknown extends Error {}

function fail(why) {
  throw new Unknown(why)
}

// ---------------------------------------------------------------------------------------------
// Text

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
  return fail('an interpolation is not closed')
}

/** The index of the `"` closing the string whose body starts at `start`. */
function stringEnd(text, start) {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') index++
    else if (text[index] === '"') return index
    else if (text.startsWith('${', index)) index = interpolationEnd(text, index + 2)
  }
  return fail('a string is not closed')
}

/** The literal and interpolated parts of a template's body; a directive is not supported. */
function templateParts(text) {
  const parts = []
  let literal = ''
  for (let index = 0; index < text.length; index++) {
    if (text.startsWith('$${', index) || text.startsWith('%%{', index)) {
      literal += text.slice(index + 1, index + 3)
      index += 2
    } else if (text.startsWith('${', index)) {
      const end = interpolationEnd(text, index + 2)
      parts.push(literal, { expression: text.slice(index + 2, end) })
      literal = ''
      index = end
    } else if (text.startsWith('%{', index)) {
      fail('a template directive is not supported')
    } else {
      literal += text[index]
    }
  }
  parts.push(literal)
  return parts.filter((part) => part !== '')
}

const ESCAPES = { '"': '"', '\\': '\\', n: '\n', t: '\t' }

/** A string literal's body with its escapes resolved, interpolations kept. */
function unescape(body) {
  return body.replace(/\\(.)/g, (_, char) => {
    if (!Object.hasOwn(ESCAPES, char)) fail(`\\${char} is not supported`)
    return ESCAPES[char]
  })
}

const OPERATORS = ['...', '==', '!=', '<=', '>=', '&&', '||', '=>']
const PUNCTUATION = '()[]{},.=:?!<>+-*/%'

/** The tokens of an expression: numbers, names, strings (raw template bodies) and punctuation. */
function tokenize(text) {
  const tokens = []
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index)
    const char = text[index]
    if (/\s/.test(char)) {
      index++
    } else if (char === '#' || rest.startsWith('//')) {
      const end = text.indexOf('\n', index)
      index = end === -1 ? text.length : end
    } else if (rest.startsWith('/*')) {
      const end = text.indexOf('*/', index + 2)
      if (end === -1) fail('a comment is not closed')
      index = end + 2
    } else if (/[0-9]/.test(char)) {
      const [number] = rest.match(/^[0-9]+(\.[0-9]+)?/)
      tokens.push({ type: 'number', value: Number(number) })
      index += number.length
    } else if (/[A-Za-z_]/.test(char)) {
      const [name] = rest.match(/^[A-Za-z_][\w-]*/)
      tokens.push({ type: 'name', value: name })
      index += name.length
    } else if (char === '"') {
      const end = stringEnd(text, index + 1)
      tokens.push({ type: 'string', value: text.slice(index + 1, end) })
      index = end + 1
    } else {
      const operator = OPERATORS.find((candidate) => rest.startsWith(candidate))
      if (operator === undefined && !PUNCTUATION.includes(char)) fail(`${char} is not supported`)
      const type = operator ?? char
      tokens.push({ type })
      index += type.length
    }
  }
  return tokens
}

const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']]

/** The syntax tree of an expression. */
function parseExpression(text) {
  const tokens = tokenize(text)
  let position = 0
  const peek = () => tokens[position]?.type
  const isName = (name) => peek() === 'name' && tokens[position].value === name
  const take = (type) => {
    if (peek() !== type) fail(`${type} expected`)
    return tokens[position++]
  }
  const accept = (type) => {
    if (peek() !== type) return false
    position++
    return true
  }
  const keyword = (name) => {
    if (!isName(name)) fail(`${name} expected`)
    position++
  }

  function expression() {
    const test = binary(0)
    if (!accept('?')) return test
    const yes = expression()
    take(':')
    return { type: 'conditional', test, yes, no: expression() }
  }

  function binary(level) {
    if (level === LEVELS.length) return unary()
    let left = binary(level + 1)
    while (LEVELS[level].includes(peek())) {
      const operator = tokens[position++].type
      left = { type: 'binary', operator, left, right: binary(level + 1) }
    }
    return left
  }

  function unary() {
    if (peek() === '!' || peek() === '-') {
      const operator = tokens[position++].type
      return { type: 'unary', operator, of: unary() }
    }
    return postfix()
  }

  function postfix() {
    let node = primary()
    for (;;) {
      if (accept('.')) {
        node = { type: 'index', of: node, key: { type: 'literal', value: take('name').value } }
      } else if (accept('[')) {
        node = { type: 'index', of: node, key: expression() }
        take(']')
      } else {
        return node
      }
    }
  }

  function forExpression(close) {
    keyword('for')
    const first = take('name').value
    const second = accept(',') ? take('name').value : null
    keyword('in')
    const collection = expression()
    take(':')
    const key = close === '}' ? expression() : null
    if (close === '}') take('=>')
    const value = expression()
    if (peek() === '...') fail('grouping is not supported')
    let condition = null
    if (isName('if')) {
      position++
      condition = expression()
    }
    take(close)
    return { type: 'for', close, first, second, collection, key, value, condition }
  }

  function primary() {
    const token = tokens[position++]
    switch (token?.type) {
      case 'number':
        return { type: 'literal', value: token.value }
      case 'string':
        return { type: 'template', text: unescape(token.value) }
      case 'name':
        if (['true', 'false', 'null'].includes(token.value)) {
          return { type: 'literal', value: JSON.parse(token.value) }
        }
        if (accept('(')) return call(token.value)
        return { type: 'reference', name: token.value }
      case '[':
        if (isName('for')) return forExpression(']')
        return { type: 'tuple', items: tuple() }
      case '{':
        if (isName('for')) return forExpression('}')
        return { type: 'object', entries: object() }
      case '(': {
        const inner = expression()
        take(')')
        return inner
      }
      default:
        return fail('an expression expected')
    }
  }

  function call(name) {
    const args = []
    let expand = false
    while (!accept(')')) {
      args.push(expression())
      if (accept('...')) expand = true
      if (!accept(',')) {
        take(')')
        break
      }
    }
    return { type: 'call', name, args, expand }
  }

  function tuple() {
    const items = []
    while (!accept(']')) {
      items.push(expression())
      if (!accept(',')) {
        take(']')
        break
      }
    }
    return items
  }

  function object() {
    const entries = []
    while (!accept('}')) {
      const token = tokens[position++]
      let key
      if (token?.type === 'name') key = { type: 'literal', value: token.value }
      else if (token?.type === 'string') key = { type: 'template', text: unescape(token.value) }
      else if (token?.type === '(') {
        key = expression()
        take(')')
      } else fail('a key expected')
      if (!accept('=')) take(':')
      entries.push([key, expression()])
      accept(',')
    }
    return entries
  }

  const node = expression()
  if (position < tokens.length) fail('the expression goes on')
  return node
}

// ---------------------------------------------------------------------------------------------
// Evaluation

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Opaque)
const isOpaque = (value) =>
  value instanceof Opaque || (typeof value === 'string' && value.includes('‹'))

/** A value made a string inside a template. */
function stringOf(value) {
  if (value instanceof Opaque) return String(value)
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value)
  return fail('only a string, number or bool goes into a template')
}

function expect(value, check, what) {
  if (!check(value)) fail(`${what} expected`)
  return value
}
const asString = (value) => expect(value, (v) => typeof v === 'string', 'a string')
const asNumber = (value) => expect(value, (v) => typeof v === 'number', 'a number')
const asBoolean = (value) => expect(value, (v) => typeof v === 'boolean', 'a bool')
const asList = (value) => expect(value, Array.isArray, 'a list')
const asMap = (value) => expect(value, isObject, 'a map')

/** The entries a for expression or a function walks: a list by index, a map by sorted key. */
function entriesOf(collection) {
  if (Array.isArray(collection)) return collection.map((value, index) => [index, value])
  return Object.keys(asMap(collection))
    .sort()
    .map((key) => [key, collection[key]])
}

/** `value` with the keys of every map sorted, as jsonencode writes them. */
function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedKeys(value[key])]),
  )
}

/** A function that only reshapes its argument: an opaque one passes through unchanged. */
const reshape = (apply) => (args) => (isOpaque(args[0]) ? args[0] : apply(...args))

const FUNCTIONS = {
  get_repo_root: (_, context) => context.root,
  find_in_parent_folders: ([name], context) => {
    let dir = context.from
    while (!existsSync(join(dir, name))) {
      if (dir === context.root || dir === dirname(dir)) fail(`no ${name} above`)
      dir = dirname(dir)
    }
    return join(dir, name)
  },
  file: ([path], context) => readFileSync(resolve(context.from, path), 'utf8'),
  templatefile: ([path, variables], context) => {
    const text = readFileSync(resolve(context.from, path), 'utf8')
    return evaluateTemplate(text, { ...context, scope: asMap(variables), lookup: undefined })
  },
  yamldecode: ([text]) => parseYaml(text),
  jsondecode: ([text]) => JSON.parse(text),
  jsonencode: ([value]) => JSON.stringify(sortedKeys(value)),
  split: ([separator, text]) => asString(text).split(separator),
  join: ([separator, list]) => asList(list).map(stringOf).join(separator),
  replace: ([text, search, replacement]) => {
    if (/^\/.*\/$/.test(search)) fail('a pattern is not supported')
    return asString(text).replaceAll(search, replacement)
  },
  trimsuffix: ([text, suffix]) => (text.endsWith(suffix) ? text.slice(0, -suffix.length) : text),
  trimprefix: ([text, prefix]) => (text.startsWith(prefix) ? text.slice(prefix.length) : text),
  startswith: ([text, prefix]) => text.startsWith(prefix),
  endswith: ([text, suffix]) => text.endsWith(suffix),
  format: ([pattern, ...args]) => {
    let next = 0
    return pattern.replace(/%(.)/g, (_, verb) => {
      if (verb === '%') return '%'
      const arg = args[next++]
      if (verb === 's' || verb === 'd') return stringOf(arg)
      if (verb === 'q') return JSON.stringify(stringOf(arg))
      return fail(`%${verb} is not supported`)
    })
  },
  merge: (args) => Object.assign({}, ...args.filter((arg) => arg !== null).map(asMap)),
  keys: ([map]) => Object.keys(asMap(map)).sort(),
  values: ([map]) => entriesOf(asMap(map)).map(([, value]) => value),
  length: ([value]) => {
    if (typeof value === 'string' || Array.isArray(value)) return value.length
    return Object.keys(asMap(value)).length
  },
  contains: ([list, value]) =>
    asList(list).some((item) => JSON.stringify(item) === JSON.stringify(value)),
  lookup: ([map, key, ...fallback]) => {
    if (Object.hasOwn(asMap(map), key)) return map[key]
    if (fallback.length === 0) fail(`no ${key}`)
    return fallback[0]
  },
  concat: (lists) => lists.map(asList).flat(),
  toset: ([list]) => [...new Set(asList(list))].sort(),
  tolist: ([list]) => asList(list),
  tomap: ([map]) => asMap(map),
  flatten: ([list]) => asList(list).flat(Infinity),
  coalesce: (args) => {
    const found = args.find((arg) => arg !== null && arg !== '')
    if (found === undefined) fail('every argument is empty')
    return found
  },
  urlencode: ([text]) => {
    if (text instanceof Opaque) return text
    // What only a run knows stays as it is, between the encoded parts
    return asString(text)
      .split(/(‹[^›]*›)/)
      .map((part) =>
        part.startsWith('‹') ? part : encodeURIComponent(part).replaceAll('%20', '+'),
      )
      .join('')
  },
  // A hash of what only a run knows is itself only a run's, and shows nothing of its input
  sha256: ([text]) => {
    if (text instanceof Opaque) return new Opaque(`sha256 of ${text.label}`)
    if (isOpaque(text)) return new Opaque('sha256 of a value only a run knows')
    return createHash('sha256').update(asString(text)).digest('hex')
  },
  base64decode: reshape((text) => Buffer.from(asString(text), 'base64').toString('utf8')),
  base64encode: reshape((text) => Buffer.from(asString(text), 'utf8').toString('base64')),
  tostring: reshape((value) => stringOf(value)),
  lower: reshape((text) => asString(text).toLowerCase()),
  upper: reshape((text) => asString(text).toUpperCase()),
  trimspace: reshape((text) => asString(text).trim()),
}

function equal(left, right) {
  if (isOpaque(left) || isOpaque(right)) fail('only a run can compare it')
  return JSON.stringify(left) === JSON.stringify(right)
}

const BINARY = {
  '||': (a, b) => asBoolean(a) || asBoolean(b),
  '&&': (a, b) => asBoolean(a) && asBoolean(b),
  '==': (a, b) => equal(a, b),
  '!=': (a, b) => !equal(a, b),
  '<': (a, b) => asNumber(a) < asNumber(b),
  '>': (a, b) => asNumber(a) > asNumber(b),
  '<=': (a, b) => asNumber(a) <= asNumber(b),
  '>=': (a, b) => asNumber(a) >= asNumber(b),
  '+': (a, b) => asNumber(a) + asNumber(b),
  '-': (a, b) => asNumber(a) - asNumber(b),
  '*': (a, b) => asNumber(a) * asNumber(b),
  '/': (a, b) => asNumber(a) / asNumber(b),
  '%': (a, b) => asNumber(a) % asNumber(b),
}

function lookupName(name, context) {
  if (Object.hasOwn(context.scope, name)) return context.scope[name]
  const found = context.lookup?.(name)
  if (found === undefined) fail(`${name} is not known`)
  return found
}

function indexValue(of, key) {
  if (isOpaque(key)) fail('only a run knows the key')
  if (of instanceof Opaque) return new Opaque(`${of.label}.${key}`, of.instance)
  if (of instanceof Instance) {
    const found = of.get(key)
    return found === undefined ? new Opaque(`${of.label}.${key}`, of) : found
  }
  if (of instanceof Lazy) return of.get(key)
  if (of === null || typeof of !== 'object' || !Object.hasOwn(of, key)) fail(`no ${key}`)
  return of[key]
}

function evaluateNode(node, context) {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'template':
      return evaluateTemplate(node.text, context)
    case 'reference':
      return lookupName(node.name, context)
    case 'index':
      return indexValue(evaluateNode(node.of, context), evaluateNode(node.key, context))
    case 'tuple':
      return node.items.map((item) => evaluateNode(item, context))
    case 'object':
      return Object.fromEntries(
        node.entries.map(([key, value]) => [
          stringOf(evaluateNode(key, context)),
          evaluateNode(value, context),
        ]),
      )
    case 'conditional':
      return evaluateNode(asBoolean(evaluateNode(node.test, context)) ? node.yes : node.no, context)
    case 'binary':
      return BINARY[node.operator](
        evaluateNode(node.left, context),
        evaluateNode(node.right, context),
      )
    case 'unary': {
      const value = evaluateNode(node.of, context)
      return node.operator === '!' ? !asBoolean(value) : -asNumber(value)
    }
    case 'for':
      return evaluateFor(node, context)
    default:
      return evaluateCall(node, context)
  }
}

function evaluateFor(node, context) {
  const collection = evaluateNode(node.collection, context)
  if (collection instanceof Opaque) fail('only a run knows the collection')
  const result = node.close === ']' ? [] : {}
  for (const [key, value] of entriesOf(collection)) {
    const names =
      node.second === null ? { [node.first]: value } : { [node.first]: key, [node.second]: value }
    const inner = { ...context, scope: { ...context.scope, ...names } }
    if (node.condition && !asBoolean(evaluateNode(node.condition, inner))) continue
    const item = evaluateNode(node.value, inner)
    if (node.close === ']') {
      result.push(item)
      continue
    }
    const itemKey = stringOf(evaluateNode(node.key, inner))
    if (Object.hasOwn(result, itemKey)) fail(`${itemKey} is there twice`)
    result[itemKey] = item
  }
  return result
}

function evaluateCall({ name, args, expand }, context) {
  if (name === 'try') {
    for (const arg of args) {
      try {
        return evaluateNode(arg, context)
      } catch {
        // The next one
      }
    }
    return fail('every attempt failed')
  }
  if (name === 'can') {
    try {
      evaluateNode(args[0], context)
      return true
    } catch {
      return false
    }
  }
  if (name === 'get_env') {
    const variable = asString(evaluateNode(args[0], context))
    if (args.length < 2) fail(`${variable} has no default`)
    const fallback = evaluateNode(args[1], context)
    context.overrides.push(variable)
    return fallback
  }
  if (!Object.hasOwn(FUNCTIONS, name)) fail(`${name} is not supported`)
  let values = args.map((arg) => evaluateNode(arg, context))
  if (expand) values = [...values.slice(0, -1), ...asList(values.at(-1))]
  return FUNCTIONS[name](values, context)
}

function evaluateTemplate(text, context) {
  const parts = templateParts(text)
  // A template of one interpolation is that expression's value, of whatever type
  if (parts.length === 1 && typeof parts[0] !== 'string') {
    return evaluateNode(parseExpression(parts[0].expression), context)
  }
  return parts
    .map((part) =>
      typeof part === 'string'
        ? part
        : stringOf(evaluateNode(parseExpression(part.expression), context)),
    )
    .join('')
}

function evaluateJson(json, context) {
  if (typeof json === 'string') return evaluateTemplate(json, context)
  if (json === null || typeof json !== 'object') return json
  if (Array.isArray(json)) return json.map((item) => evaluateJson(item, context))
  return Object.fromEntries(
    Object.entries(json).map(([key, value]) => [key, evaluateJson(value, context)]),
  )
}

/**
 * The value of what hcl2json gives for an expression: a template string, or a structure of them.
 * `context` holds the `scope` of names, an optional `lookup(name)` for the names it lacks, the
 * repository's `root` and the directory to evaluate `from`. The result is
 * `{ known, value, overrides }`, overrides naming the environment variables that can replace it.
 */
export function evaluate(json, context) {
  const overrides = []
  try {
    const value = evaluateJson(json, { ...context, overrides })
    return { known: true, value, overrides }
  } catch {
    // What it cannot read, or a function that fails on what it is given, leaves it unknown
    return { known: false }
  }
}

/** How an expression reads: a lone interpolation unwrapped, a structure as JSON. */
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
