// The deployment view of pnpm deploy:graph (scripts/deploy-graph.mjs): what runs where and what
// each part reaches, read from the code alone, as the code view is. Every unit's module is
// evaluated as OpenTofu would plan it, with the unit's inputs, as far as the files settle it:
// - a Coolify application or service is its compose file, each service a container, routed at the
//   host its resource names and run on the server it names;
// - a container's environment is its compose file's, filled from the variables the module sets
//   on the application or service; an address in it is a connection, to another container of the
//   same compose file, to a container's public host, or to an endpoint outside;
// - a DNS record of a container's host tells where it leads;
// - any other resource that names an address (a CI variable, an auth hook) points at it;
// - a secret read from a secret manager is a link from the secrets to whatever holds it.
// The code says nothing of what is running: drift does not show here.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { evaluate, Instance, Lazy, Opaque } from './hcl.mjs'
import { layoutGraph } from './layout.mjs'

const first = (blocks) => blocks[0]
const META = new Set(['for_each', 'count', 'depends_on', 'lifecycle', 'provider', 'timeouts'])

// ---------------------------------------------------------------------------------------------
// Modules

/** The instances of every unit's module, evaluated on demand. */
function evaluateModules(units, root) {
  const contexts = new Map()
  const busy = new Set()

  /** Guards a value that needs itself, which only a run could tell. */
  function once(key, read) {
    if (busy.has(key)) throw new Error(`${key} needs itself`)
    busy.add(key)
    try {
      return read()
    } finally {
      busy.delete(key)
    }
  }

  function outputOf(unitName, output) {
    const context = contexts.get(unitName)
    const block = context?.blocks.output[output]
    if (!block) return undefined
    const result = once(`${unitName}.output.${output}`, () => context.run(first(block).value))
    return result.known ? result.value : undefined
  }

  for (const unit of units) {
    if (!unit.module) continue
    const { blocks, moduleDir, inputs, dependencyUnits } = unit.internal
    const memo = new Map()
    const dependency = Object.fromEntries(
      [...dependencyUnits].map(([name, from]) => [
        name,
        { outputs: new Instance(from, (output) => outputOf(from, output)) },
      ]),
    )

    const variable = (name) => {
      const input = inputs.find((candidate) => candidate.name === name)
      const block = first(blocks.variable[name])
      let result = { known: false }
      if (input) {
        const { json, context } = input.raw
        result = evaluate(json, { ...context, scope: { ...context.scope, dependency } })
      } else if ('default' in block) {
        result = run(block.default)
      }
      return result.known ? result.value : new Opaque(`var.${name}`)
    }
    const local = (name) =>
      once(`${unit.name}.local.${name}`, () => {
        const result = run(blocks.locals[name])
        if (!result.known) throw new Error(`local.${name} is not known`)
        return result.value
      })
    const lazyOf = (kind) =>
      new Map(
        Object.keys(blocks[kind]).map((type) => [
          type,
          new Lazy(Object.keys(blocks[kind][type]), (name) => instances(kind, type, name)),
        ]),
      )
    const resources = lazyOf('resource')
    const data = lazyOf('data')
    const names = {
      var: new Lazy(Object.keys(blocks.variable), variable),
      local: new Lazy(Object.keys(blocks.locals), local),
      data: new Lazy([...data.keys()], (type) => data.get(type)),
    }
    const base = {
      root,
      from: moduleDir,
      scope: { path: { module: moduleDir, root } },
      lookup: (name) => names[name] ?? resources.get(name),
    }
    const run = (json, scope = {}) =>
      evaluate(json, { ...base, scope: { ...base.scope, ...scope } })

    function instance(kind, type, name, block, key, scope) {
      const label = `${kind === 'data' ? 'data.' : ''}${type}.${name}${key === null ? '' : `[${JSON.stringify(key)}]`}`
      const created = new Instance(label, (attribute) => {
        if (!META.has(attribute) && attribute in block) {
          const result = run(block[attribute], scope)
          return result.known ? result.value : new Opaque(`${label}.${attribute}`, created)
        }
        // A secret version's value is the secret it is named after
        if (attribute === 'data' && type.endsWith('secret_version')) {
          return new Opaque(`secret ${created.get('secret_name')}`, created)
        }
        return undefined
      })
      return Object.assign(created, { unit: unit.name, kind, type, name, key, block })
    }

    function instances(kind, type, name) {
      const id = `${kind}.${type}.${name}`
      if (!memo.has(id)) {
        const block = first(blocks[kind][type][name])
        let made
        if ('for_each' in block) {
          const each = run(block.for_each)
          made = !each.known
            ? new Opaque(`${type}.${name}`)
            : Object.fromEntries(
                (Array.isArray(each.value)
                  ? each.value.map((item) => [item, item])
                  : Object.entries(each.value)
                ).map(([key, value]) => [
                  key,
                  instance(kind, type, name, block, key, { each: { key, value } }),
                ]),
              )
        } else if ('count' in block) {
          const count = run(block.count)
          made = Array.from({ length: count.value }, (_, index) =>
            instance(kind, type, name, block, index, { count: { index } }),
          )
        } else {
          made = instance(kind, type, name, block, null, {})
        }
        memo.set(id, made)
      }
      return memo.get(id)
    }

    const all = () =>
      Object.keys(blocks.resource)
        .sort()
        .flatMap((type) =>
          Object.keys(blocks.resource[type])
            .sort()
            .flatMap((name) => {
              const made = instances('resource', type, name)
              if (made instanceof Instance) return [made]
              return Array.isArray(made) ? made : Object.values(made)
            }),
        )
        .filter((made) => made instanceof Instance)

    contexts.set(unit.name, { blocks, run, all })
  }
  return { all: () => [...contexts.values()].flatMap((context) => context.all()) }
}

// ---------------------------------------------------------------------------------------------
// Values

/**
 * `text` with its variables filled as Docker Compose fills them: `${NAME}`, `$NAME`, a default
 * after `:-` (unset or empty) or `-` (unset), `:?` and `?` taken as plain; `$$` is a `$`.
 */
export function interpolate(text, variables) {
  const names = []
  const filled = text.replace(
    /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?)([-?])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, colon, kind, fallback, bare) => {
      if (match === '$$') return '$'
      const name = braced ?? bare
      if (!names.includes(name)) names.push(name)
      const set = Object.hasOwn(variables, name)
      const value = set ? String(variables[name]) : undefined
      if (kind === '-' && (!set || (colon && value === ''))) return fallback
      return set ? value : `‹${name} is not set›`
    },
  )
  return { text: filled, names }
}

/** The addresses in `text`: a scheme, a host (or what only a run knows of it) and a port. */
export function addressesIn(text) {
  const hidden = []
  const plain = String(text).replace(
    /‹[^›]*›/g,
    (marker) => `\u0001${hidden.push(marker) - 1}\u0002`,
  )
  const restore = (part) => part.replace(/\u0001(\d+)\u0002/g, (_, index) => hidden[index])
  return [
    ...plain.matchAll(
      /([a-z][a-z0-9+.-]*):\/\/(?:[^\s@/]*@)?([A-Za-z0-9.-]+|\u0001\d+\u0002)(?::(\d+))?/g,
    ),
  ].map(([, scheme, host, port]) => ({ scheme, host: restore(host), port: port ?? null }))
}

// A secret, or something made of one (its hash)
const secretsIn = (text) =>
  [...String(text).matchAll(/‹(?:[^›]* of )?secret ([^›]+)›/g)].map(([, name]) => name)
const unmarked = (host) => host.replace(/^‹(.*)›$/, '$1')

/** Every string in `value`, with its path below `path`; a string holding JSON is walked too. */
function stringsIn(value, path) {
  if (value instanceof Opaque) return [[path, String(value)]]
  if (typeof value === 'string') {
    if (/^[[{]/.test(value)) {
      try {
        return stringsIn(JSON.parse(value), path)
      } catch {
        // A string that only looks like JSON
      }
    }
    return [[path, value]]
  }
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, inner]) =>
    stringsIn(inner, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`),
  )
}

// ---------------------------------------------------------------------------------------------
// The deployment

/** What runs where, read from the units of a stack (readStack of scripts/deploy-graph.mjs). */
export function readDeployment(units, { root }) {
  const modules = evaluateModules(units, root)
  const instances = modules.all()
  const warnings = []
  const consumed = new Set()
  const ofType = (type) => instances.filter((candidate) => candidate.type === type)
  const pointsAt = (holder, attribute, target) => holder.get(attribute)?.instance === target

  // The providers' own addresses, from the files the units generate
  const providers = new Map()
  for (const unit of units) {
    for (const contents of unit.internal.generates) {
      for (const [, name, endpoint] of contents.matchAll(
        /provider\s+"([\w-]+)"\s*\{[^}]*?endpoint\s*=\s*"([^"]+)"/g,
      )) {
        providers.set(name, endpoint)
      }
    }
  }

  // The compose projects: Coolify applications from a file of the repository, services from text
  const projects = []
  const project = (resource, text, hosts, variables) => {
    consumed.add(resource)
    let compose
    try {
      compose = parseYaml(text)
    } catch {
      warnings.push(`The compose file of ${resource.label} is not one Docker Compose reads.`)
      return
    }
    const environment = resource.get('environment_uuid')?.instance?.get('name')
    projects.push({
      resource,
      compose,
      hosts,
      variables,
      group: `${resource.get('name')} · ${environment ?? '?'}`,
      server: resource.get('server_uuid') ?? null,
    })
  }
  for (const application of ofType('coolify_application')) {
    const location = application.get('docker_compose_location')
    const file = join(root, String(location))
    if (!existsSync(file)) {
      consumed.add(application)
      warnings.push(
        `The compose file ${location} of ${application.label} is not in this repository.`,
      )
      continue
    }
    const domains = application.get('docker_compose_domains')
    const hosts = Object.fromEntries(
      (typeof domains === 'string' ? JSON.parse(domains) : []).map(({ name, domain }) => [
        name,
        domain,
      ]),
    )
    const variables = {}
    for (const variable of ofType('coolify_environment_variable')) {
      if (!pointsAt(variable, 'application_uuid', application)) continue
      consumed.add(variable)
      variables[variable.get('key')] = variable.get('value')
    }
    project(application, readFileSync(file, 'utf8'), hosts, variables)
  }
  for (const service of ofType('coolify_service')) {
    const hosts = Object.fromEntries(
      (service.get('urls') ?? []).map(({ name, url }) => [name, url]),
    )
    const variables = {}
    for (const bulk of ofType('coolify_envs_bulk')) {
      if (!pointsAt(bulk, 'resource_uuid', service)) continue
      consumed.add(bulk)
      Object.assign(variables, bulk.get('variables'))
    }
    project(service, String(service.get('docker_compose_raw')), hosts, variables)
  }

  // DNS records, at the host of the zone they name
  const records = []
  for (const record of instances) {
    if (!record.type.endsWith('_domain_record')) continue
    consumed.add(record)
    const zone = record.get('dns_zone')?.instance?.get('domain')
    const name = record.get('name')
    if (typeof zone !== 'string' || typeof name !== 'string') continue
    records.push({
      host: name === '' ? zone : `${name}.${zone}`,
      type: record.get('type'),
      data: record.get('data'),
    })
  }

  // The containers
  const containers = []
  for (const { resource, compose, hosts, variables, group, server } of projects) {
    for (const [service, definition] of Object.entries(compose.services ?? {})) {
      const url = hosts[service] ?? null
      const host = url === null ? null : new URL(url).hostname
      const listed = Array.isArray(definition.environment)
        ? definition.environment.map((entry) => {
            const [name, ...rest] = entry.split('=')
            return [name, rest.length > 0 ? rest.join('=') : `\${${name}:-}`]
          })
        : Object.entries(definition.environment ?? {})
      const env = listed.map(([name, raw]) => {
        const { text, names } = interpolate(String(raw), variables)
        return { name, value: text, from: names.filter((used) => Object.hasOwn(variables, used)) }
      })
      const build = definition.build
        ? {
            target: definition.build.target ?? null,
            args: Object.fromEntries(
              Object.entries(definition.build.args ?? {}).map(([name, raw]) => [
                name,
                interpolate(String(raw), variables).text,
              ]),
            ),
          }
        : null
      containers.push({
        id: `${resource.unit}:${service}`,
        kind: 'container',
        label: service,
        service,
        unit: resource.unit,
        group,
        server,
        url,
        host,
        ports: (definition.expose ?? []).map(String),
        image: definition.image ?? null,
        build,
        dependsOn: Array.isArray(definition.depends_on)
          ? Object.fromEntries(definition.depends_on.map((name) => [name, 'started']))
          : Object.fromEntries(
              Object.entries(definition.depends_on ?? {}).map(([name, { condition }]) => [
                name,
                condition,
              ]),
            ),
        volumes: (definition.volumes ?? []).map(String),
        health: Boolean(definition.healthcheck),
        env,
        records: records
          .filter((record) => record.host === host)
          .map(({ type, data }) => ({ type, data })),
        secrets: [...new Set(env.flatMap((entry) => secretsIn(entry.value)))].sort(),
        resource,
      })
    }
  }

  // The links, each from one node to another with what carries it
  const links = []
  const link = (from, to, kind, name, value) => {
    let found = links.find((candidate) => candidate.from === from && candidate.to === to)
    if (!found) {
      found = { from, to, kind, via: [] }
      links.push(found)
    }
    found.via.push({ name, value })
  }
  const endpoints = new Map()
  const endpoint = (host, port) => {
    const id = `endpoint:${unmarked(host)}`
    if (!endpoints.has(id)) {
      const provider = [...providers].find(([, address]) => new URL(address).hostname === host)
      endpoints.set(id, {
        id,
        kind: 'endpoint',
        label: unmarked(host),
        host: unmarked(host),
        ports: [],
        provider: provider?.[0] ?? null,
      })
    }
    const found = endpoints.get(id)
    if (port !== null && !found.ports.includes(port)) found.ports.push(port)
    return id
  }
  const byHost = (host) => containers.find((container) => container.host === host)
  const target = (from, host, port) => {
    const sibling = containers.find(
      (container) => container.resource === from.resource && container.service === host,
    )
    if (sibling) return [sibling.id, 'internal']
    const routed = byHost(host)
    if (routed) return [routed.id, 'names']
    return [endpoint(host, port), 'request']
  }

  for (const container of containers) {
    if (container.url) link('browser', container.id, 'request', container.url, container.host)
  }
  for (const container of containers) {
    const entries = [
      ...Object.entries(container.build?.args ?? {}).map(([name, value]) => [
        `build ${name}`,
        value,
      ]),
      ...container.env.map(({ name, value }) => [name, value]),
    ]
    const ports = Object.fromEntries(container.env.map(({ name, value }) => [name, value]))
    for (const [name, value] of entries) {
      const found = addressesIn(value)
      // A host given alone, its port beside it
      if (found.length === 0 && /_HOST$/.test(name) && /^([A-Za-z0-9.-]+|‹[^›]*›)$/.test(value)) {
        found.push({ host: value, port: ports[name.replace(/_HOST$/, '_PORT')] ?? null })
      }
      for (const { host, port } of found) {
        const [to, kind] = target(container, host, port)
        if (to !== container.id) link(container.id, to, kind, name, value)
      }
    }
  }
  for (const container of containers) {
    for (const [service, condition] of Object.entries(container.dependsOn)) {
      link(`${container.unit}:${service}`, container.id, 'order', condition, null)
    }
  }

  // Any other resource that names an address or holds a secret, grouped by unit and provider
  const holders = new Map()
  for (const resource of instances) {
    if (consumed.has(resource)) continue
    const strings = Object.keys(resource.block)
      .filter((attribute) => !META.has(attribute))
      .flatMap((attribute) => stringsIn(resource.get(attribute), `${resource.label}.${attribute}`))
    const addresses = strings.flatMap(([path, text]) =>
      addressesIn(text).map((address) => ({ path, text, ...address })),
    )
    const secrets = strings.flatMap(([, text]) => secretsIn(text))
    if (addresses.length === 0 && secrets.length === 0) continue
    const provider = resource.type.split('_')[0]
    const id = `resource:${resource.unit}:${provider}`
    if (!holders.has(id)) {
      holders.set(id, {
        id,
        kind: 'resource',
        label: provider,
        unit: resource.unit,
        resources: [],
        secrets: [],
      })
    }
    const holder = holders.get(id)
    const address = `${resource.type}.${resource.name}`
    if (!holder.resources.includes(address)) holder.resources.push(address)
    holder.secrets.push(...secrets.filter((name) => !holder.secrets.includes(name)))
    for (const { path, text, host, port } of addresses) {
      link(id, byHost(host)?.id ?? endpoint(host, port), 'config', path, text)
    }
  }
  for (const holder of holders.values()) {
    holder.resources.sort()
    holder.secrets.sort()
  }

  const secretNames = [
    ...new Set([...containers, ...holders.values()].flatMap((holder) => holder.secrets)),
  ].sort()
  for (const holder of [...containers, ...holders.values()]) {
    for (const name of holder.secrets) link(holder.id, 'secrets', 'secret', name, null)
  }

  const servers = new Map()
  for (const { server, host } of containers) {
    if (server === null) continue
    if (!servers.has(server)) {
      servers.set(server, { uuid: server, addresses: [], api: providers.get('coolify') })
    }
    // The server's own addresses: what its hosts' address records hold
    const addressRecords = records.filter(
      (candidate) => candidate.host === host && ['A', 'AAAA'].includes(candidate.type),
    )
    for (const record of addressRecords) {
      const { addresses } = servers.get(server)
      if (!addresses.includes(record.data)) addresses.push(record.data)
    }
  }

  const nodes = [
    ...(containers.length > 0 ? [{ id: 'browser', kind: 'browser', label: 'Browser' }] : []),
    ...holders.values(),
    ...(secretNames.length > 0
      ? [{ id: 'secrets', kind: 'secrets', label: 'Secrets', names: secretNames }]
      : []),
    // The resource and the service name served the links alone
    ...containers.map((container) => {
      const shown = { ...container }
      delete shown.resource
      delete shown.service
      return shown
    }),
    ...endpoints.values(),
  ]
  // The columns by role: who calls in on the left, then the containers, layered by their
  // connections among themselves, then what they rely on. Traffic and what a resource outside
  // points at order the rows; start order and secrets run across it, and containers that only name
  // each other's address, as the API names the panel's and the panel is built for the API's,
  // would tie the two
  const placing = links.filter((candidate) =>
    ['request', 'internal', 'config'].includes(candidate.kind),
  )
  const ids = containers.map((container) => container.id)
  const inner = layoutGraph(
    ids,
    placing.filter((candidate) => ids.includes(candidate.from) && ids.includes(candidate.to)),
  ).nodes
  const columns = new Map(
    nodes.map((node) => {
      if (node.kind === 'container') return [node.id, 1 + inner[node.id].column]
      if (['browser', 'resource'].includes(node.kind)) return [node.id, 0]
      return [node.id, Number.MAX_SAFE_INTEGER]
    }),
  )
  return {
    nodes,
    links,
    server: [...servers.values()],
    records,
    warnings,
    layout: layoutGraph(
      nodes.map((node) => node.id),
      placing,
      { columns },
    ),
  }
}
