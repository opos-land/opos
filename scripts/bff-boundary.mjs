#!/usr/bin/env node
// The BFF boundary (docs/PLAN.md, 3.2): the panel and the portal talk to the API only, so in
// apps/panel and apps/portal, and in their production bundles, nothing names Supabase.
//
//   (no argument)   every file of the two applications that git lists, the templates included
//   <file>...       only those of the given files that lie in the two applications (lefthook)
//   --dist          also the bundles in dist/ of both applications, built with
//                   VITE_API_URL=https://opos-control.invalid and SUPABASE_SECRET_KEY=opos-canary-secret-x
//   --hook          Claude Code PostToolUse hook for Edit, Write and Bash: refuses with exit 2
//
// A breach names the file and the rule and never the text that matched: a hook's output reaches an
// agent's context, and the files read include the .env.example templates.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The address the control build is given: a bundle that lacks it was not built from this tree. */
export const CONTROL = 'opos-control.invalid'
/** A secret of the build environment, which no bundle may hold. */
export const CANARY = 'opos-canary-secret-x'

const APPS = ['apps/panel', 'apps/portal']
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf)$/i

const RULES = [
  ['a dependency or import of @supabase/*', /@supabase\//],
  ['an address of Supabase or of the local stack', /supabase\.(?:co|in|com)\b|:54321(?!\d)/],
  ['a Supabase key', /sb_(?:publishable|secret)_/],
  ['a JWT', /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/],
  ['a VITE_ variable naming Supabase', /VITE_\w*SUPABASE/i],
]

/** The rules each file breaks, as `path: rule`. */
const ruleBreaches = (files) =>
  [...files].flatMap(([path, text]) =>
    RULES.filter(([, pattern]) => pattern.test(text)).map(([rule]) => `${path}: ${rule}`),
  )

/**
 * The breaches of the boundary in `sources` and, when given, in `dist` (path -> text). A dist
 * without the control value proves nothing, since the scan may have read a bundle of another
 * build, and fails.
 */
export function findBoundaryBreaches({ sources = new Map(), dist }) {
  const found = ruleBreaches(sources)
  if (!dist) return found
  const bundles = [...dist]
  if (!bundles.some(([, text]) => text.includes(CONTROL))) {
    found.push(
      `dist: control value ${CONTROL} not found in any bundle, so the scan proves nothing: build with VITE_API_URL=https://${CONTROL}`,
    )
  }
  for (const [path, text] of bundles) {
    if (text.includes(CANARY)) {
      found.push(`${path}: holds the canary secret ${CANARY}, so a secret of the build reached it`)
    }
  }
  return [...found, ...ruleBreaches(dist)]
}

const inApps = (path) => APPS.some((app) => path.startsWith(`${app}/`))

/** The text of each file that exists and is not binary, by path. */
function read(root, paths) {
  const files = new Map()
  for (const path of paths) {
    if (BINARY.test(path) || !statSync(join(root, path), { throwIfNoEntry: false })?.isFile()) {
      continue
    }
    files.set(path, readFileSync(join(root, path), 'utf8'))
  }
  return files
}

/** Every file of the two applications that git lists, which leaves out what .gitignore names. */
const listed = (root) =>
  execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...APPS],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)

/** Every file under dist/ of the two applications that were built. */
const bundles = (root) =>
  APPS.filter((app) => existsSync(join(root, app, 'dist'))).flatMap((app) =>
    readdirSync(join(root, app, 'dist'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name))),
  )

/** The breaches of the files given, of every file of the applications, and of dist on request. */
function check(root, files, withDist) {
  const paths =
    files.length > 0
      ? files.map((file) => relative(root, resolve(root, file))).filter(inApps)
      : listed(root)
  return findBoundaryBreaches({
    sources: read(root, paths),
    ...(withDist ? { dist: read(root, bundles(root)) } : {}),
  })
}

/**
 * Runs one mode in the repository at `cwd`; `stdin` reads the hook event. Returns the exit code:
 * 1 for a breach, 2 for a breach found by the hook or for a check that could not run.
 */
export function main(args, { cwd, stdin }) {
  const hook = args[0] === '--hook'
  try {
    if (hook) {
      const target = JSON.parse(stdin()).tool_input?.file_path
      if (target && !inApps(relative(cwd, resolve(cwd, target)))) return 0
    }
    const files = args.filter((arg) => !arg.startsWith('--'))
    const found = check(cwd, files, args.includes('--dist'))
    if (found.length === 0) return 0
    for (const breach of found) console.error(breach)
    console.error('The panel and the portal talk to the API only (docs/PLAN.md, 3.2).')
    return hook ? 2 : 1
  } catch (error) {
    console.error(`bff-boundary could not check this change, so it refuses it: ${error.message}`)
    return 2
  }
}

/* node:coverage ignore next 6 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: (process.argv[2] === '--hook' && process.env.CLAUDE_PROJECT_DIR) || process.cwd(),
    stdin: () => readFileSync(0, 'utf8'),
  })
}
