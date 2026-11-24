#!/usr/bin/env node
// Every dependency, development ones too, comes under a licence of ALLOWED (docs/ARCHITECTURE.md,
// Tooling and versions): permissive licences, which let OPOS keep its own licence, and the few
// weak ones whose terms reach no further than the files of the package. A licence outside the list,
// or a package that names none, fails until the team decides on it in a decision record.
//
// The licences come from `pnpm licenses list`, which reads the `license` field of each installed
// package, so the check runs after `pnpm install`.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** The SPDX identifiers a dependency may come under. */
export const ALLOWED = [
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'PSF-2.0',
  'Unlicense',
  // Data, such as caniuse-lite: attribution only.
  'CC-BY-4.0',
  // Fonts, which may ship with any software, never sold on their own.
  'OFL-1.1',
  // Copyleft of the package's own files only, which OPOS never modifies.
  'MPL-2.0',
]

const KEYWORDS = new Set(['AND', 'OR', 'WITH', '(', ')'])

/**
 * Whether an SPDX expression allows the dependency: a choice (`OR`) when one side is allowed, a
 * conjunction (`AND`) when every side is, a licence with an exception (`WITH`) as the licence
 * itself, since an exception only adds permissions. An expression that does not parse is refused.
 */
export function allows(expression) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? []
  let at = 0
  const fail = () => {
    throw new SyntaxError(expression)
  }
  const atom = () => {
    const token = tokens[at++]
    if (token === '(') {
      const inner = or()
      if (tokens[at++] !== ')') fail()
      return inner
    }
    if (token === undefined || KEYWORDS.has(token)) fail()
    if (tokens[at] === 'WITH') at += 2
    return ALLOWED.includes(token)
  }
  const and = () => {
    let allowed = atom()
    while (tokens[at] === 'AND') {
      at++
      allowed = atom() && allowed
    }
    return allowed
  }
  const or = () => {
    let allowed = and()
    while (tokens[at] === 'OR') {
      at++
      allowed = and() || allowed
    }
    return allowed
  }
  try {
    const allowed = or()
    if (at !== tokens.length) fail()
    return allowed
  } catch {
    return false
  }
}

/**
 * The refused packages of a `pnpm licenses list --json` report (licence -> packages), as
 * `name@versions: licence`. A report of no package proves nothing and throws.
 */
export function findLicenceBreaches(report) {
  const entries = Object.entries(report)
  if (entries.every(([, packages]) => packages.length === 0)) {
    throw new Error('pnpm lists no package, so there is nothing to check')
  }
  return entries
    .filter(([licence]) => !allows(licence))
    .flatMap(([licence, packages]) =>
      packages.map(({ name, versions }) => `${name}@${versions.join(', ')}: ${licence}`),
    )
}

/** Runs the check; `run` calls pnpm with the given arguments. Returns the exit code. */
export function main({ run }) {
  try {
    const found = findLicenceBreaches(JSON.parse(run(['licenses', 'list', '--json'])))
    if (found.length === 0) return 0
    for (const breach of found) console.error(breach)
    console.error(
      'A dependency comes under a licence of ALLOWED in scripts/deps-licenses.mjs (docs/ARCHITECTURE.md, Tooling and versions).',
    )
    return 1
  } catch (error) {
    console.error(`deps:licenses could not check the dependencies, so it fails: ${error.message}`)
    return 1
  }
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main({
    run: (args) => execFileSync('pnpm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  })
}
