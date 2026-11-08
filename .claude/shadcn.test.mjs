import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// The shadcn/ui skill and MCP server run the CLI an application pins in its package.json, so the
// 7-day minimumReleaseAge of pnpm-workspace.yaml covers it: never `npx shadcn@latest` or
// `pnpm dlx`, which fetch whatever was published last.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const skillDir = '.claude/skills/shadcn'
const skill = read(`${skillDir}/SKILL.md`)

/** A command that runs the CLI an application pins. */
const pinned = /^pnpm --dir apps\/(panel|portal) exec shadcn( |$)/

test('the skill may run only the CLI an application pins', () => {
  const [, frontmatter = ''] = skill.match(/^---\n([\s\S]*?)\n---\n/) ?? []
  const [, tools = ''] = frontmatter.match(/^allowed-tools: (.*)$/m) ?? []
  const allowed = [...tools.matchAll(/Bash\(([^)]*)\)/g)].map(([, command]) => command)
  assert.ok(allowed.length > 0, 'allowed-tools names the CLI')
  for (const command of allowed) assert.match(command, pinned)
})

test('the context the skill injects comes from the pinned CLI', () => {
  const injected = [...skill.matchAll(/!`([^`]*)`/g)].map(([, command]) => command)
  assert.ok(injected.length > 0, 'the skill injects the project context')
  for (const command of injected) assert.match(command, pinned)
})

test('the MCP server runs the pinned CLI', () => {
  const { mcpServers } = JSON.parse(read('.mcp.json'))
  const { command, args } = mcpServers.shadcn
  assert.match([command, ...args].join(' '), pinned)
  assert.equal(args.at(-1), 'mcp')
})

test('each application the skill names pins the CLI and has a components.json', () => {
  const apps = new Set([...skill.matchAll(/--dir apps\/(\w+)/g)].map(([, app]) => app))
  for (const app of apps) {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(read(`apps/${app}/package.json`))
    assert.ok(dependencies.shadcn ?? devDependencies.shadcn, `apps/${app} pins shadcn`)
    assert.ok(existsSync(join(root, `apps/${app}/components.json`)), `apps/${app}/components.json`)
  }
})

// No graphics enter the repository but a designer's (AGENTS.md).
test('the vendored skill carries no images', () => {
  const files = readdirSync(join(root, skillDir), { recursive: true, encoding: 'utf8' })
  assert.deepEqual(
    files.filter((file) => /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(file)),
    [],
  )
})
