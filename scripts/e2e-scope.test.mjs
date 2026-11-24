import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { main, needsE2e } from './e2e-scope.mjs'

const fixtures = []
after(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true })
})

test('a change the e2e job never reads needs no run', () => {
  for (const path of [
    'docs/ARCHITECTURE.md',
    'docs/adr/0001-record-decisions-and-specify-features.md',
    'AGENTS.md',
    'README.md',
    'CONTRIBUTORS.md',
    'infra/docker/Dockerfile',
    'infra/docker/compose.yaml',
    'infra/live/dev/env.yaml',
    'infra/modules/deployment/main.tf',
    'infra/README.md',
    '.claude/settings.json',
    '.claude/skills/docs-sync/SKILL.md',
    '.github/workflows/release-dev.yml',
    '.github/workflows/_coolify-release.yml',
    '.github/rulesets/protect-main.json',
    'scripts/deploy.mjs',
    'scripts/tests-first.mjs',
    'scripts/ci-shape.test.mjs',
    'scripts/e2e-scope.mjs',
    '.dockerignore',
    '.gitleaks.toml',
    'commitlint.config.mjs',
    'lefthook.yml',
  ]) {
    assert.equal(needsE2e([path]), false, path)
  }
})

test('a change the e2e job reads needs a run', () => {
  for (const path of [
    // The job itself
    '.github/workflows/ci.yml',
    // What stack:init runs and starts
    'scripts/stack-init.mjs',
    'infra/local/compose.yaml',
    'supabase/config.toml',
    // The tools, the dependencies and the workspace
    'mise.toml',
    'mise.lock',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    // The applications, the packages and the scenarios
    'apps/api/src/main.ts',
    'apps/panel/src/app/router.tsx',
    'apps/portal/README.md',
    'packages/db/src/seed.ts',
    'packages/db/drizzle/0001_x.sql',
    'e2e/specs/shop.spec.ts',
    // Anything no rule names
    '.prettierrc',
    'new-directory/file.ts',
  ]) {
    assert.equal(needsE2e([path]), true, path)
  }
})

test('one path the e2e job reads is enough among many it does not', () => {
  assert.equal(needsE2e(['docs/PRODUCT.md', 'apps/api/src/main.ts', 'infra/README.md']), true)
  assert.equal(needsE2e(['docs/PRODUCT.md', 'infra/README.md', '.claude/settings.json']), false)
})

test('a pull request that changes no file needs no run', () => {
  assert.equal(needsE2e([]), false)
})

test('a call without a base prints the usage and exits 64', () => {
  const lines = []
  assert.equal(main([], { log: (line) => lines.push(line) }), 64)
  assert.match(lines[0], /Usage: e2e-scope\.mjs --base <ref>/)
  assert.equal(main(['--base'], { log: () => {} }), 64)
  assert.equal(main(['--head', 'origin/develop'], { log: () => {} }), 64)
})

/** A real repository in a temporary directory: `base` with one file, then HEAD on a branch of it. */
function repository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-scope-')))
  fixtures.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'base')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '/dev/null')
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write('apps/api/src/main.ts', 'main\n')
  write('docs/PRODUCT.md', 'product\n')
  git('add', '.')
  git('commit', '-q', '-m', 'start')
  git('switch', '-q', '-c', 'change')

  const commit = (message) => {
    git('add', '-A')
    git('commit', '-q', '--allow-empty', '-m', message)
  }
  const output = join(root, 'github-output')
  const run = (...argv) => {
    const lines = []
    const code = main(argv, {
      root,
      env: { GITHUB_OUTPUT: output },
      log: (line) => lines.push(line),
    })
    return { code, lines, output: readFileSync(output, 'utf8') }
  }
  return { git, write, commit, run, root }
}

test('a branch that changes only documents writes e2e=false to the output of its step', () => {
  const { write, commit, run } = repository()
  write('docs/PRODUCT.md', 'product, changed\n')
  commit('docs')
  const result = run('--base', 'base')
  assert.equal(result.code, 0)
  assert.equal(result.output, 'e2e=false\n')
  assert.match(result.lines.at(-1), /e2e=false/)
})

test('a branch that changes code writes e2e=true and names the path that needs it', () => {
  const { write, commit, run } = repository()
  write('docs/PRODUCT.md', 'product, changed\n')
  write('apps/api/src/main.ts', 'main, changed\n')
  commit('code')
  const result = run('--base', 'base')
  assert.equal(result.code, 0)
  assert.equal(result.output, 'e2e=true\n')
  assert.ok(result.lines.some((line) => line.includes('apps/api/src/main.ts')))
  assert.ok(!result.lines.some((line) => line.includes('docs/PRODUCT.md')))
})

test('a file moved out of what the e2e job reads still needs a run', () => {
  const { git, commit, run } = repository()
  mkdirSync(join(git('rev-parse', '--show-toplevel'), 'docs/old'), { recursive: true })
  git('mv', 'apps/api/src/main.ts', 'docs/old/main.ts')
  commit('move')
  assert.equal(run('--base', 'base').output, 'e2e=true\n')
})

test('the base counts from where the branch left it, not from its newer commits', () => {
  const { git, write, commit, run } = repository()
  write('docs/PRODUCT.md', 'product, changed\n')
  commit('docs')
  git('switch', '-q', 'base')
  write('apps/api/src/main.ts', 'main, changed on base\n')
  commit('code on base')
  git('switch', '-q', 'change')
  assert.equal(run('--base', 'base').output, 'e2e=false\n')
})

test('without GITHUB_OUTPUT the answer goes to the log alone', () => {
  const { write, commit, root } = repository()
  write('apps/api/src/main.ts', 'main, changed\n')
  commit('code')
  const lines = []
  assert.equal(main(['--base', 'base'], { root, env: {}, log: (line) => lines.push(line) }), 0)
  assert.match(lines.at(-1), /e2e=true/)
})

test('a base git cannot read exits 1 and names it, so the e2e job runs', () => {
  const { root } = repository()
  const lines = []
  const code = main(['--base', 'origin/nothing'], {
    root,
    env: {},
    log: (line) => lines.push(line),
  })
  assert.equal(code, 1)
  assert.match(lines[0], /origin\/nothing/)
})
