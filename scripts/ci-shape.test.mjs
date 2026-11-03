import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The shape of the CI workflow and of the ruleset, read as text: the workflow is YAML and the root
// has no YAML parser, so the checks are regular expressions over the file.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const ci = read('../.github/workflows/ci.yml')
const ruleset = JSON.parse(read('../.github/rulesets/protect-main.json'))

/** The text of every `run:` step: the one-line form and the block scalar. */
function runBlocks(workflow) {
  const lines = workflow.split('\n')
  const blocks = []
  for (let idx = 0; idx < lines.length; idx++) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[idx])
    if (!match) continue
    if (!/^[|>][+-]?$/.test(match[2])) {
      blocks.push(match[2])
      continue
    }
    const body = []
    const indent = match[1].length + (lines[idx].includes('- run:') ? 2 : 0)
    while (idx + 1 < lines.length) {
      const next = lines[idx + 1]
      if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break
      body.push(next)
      idx++
    }
    blocks.push(body.join('\n').trimEnd())
  }
  return blocks
}

/** The contexts a ruleset requires to pass. */
function requiredChecks(rules) {
  return rules.rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context))
}

test('the workflow reads the repository and nothing more', () => {
  assert.match(ci, /^permissions:\n {2}contents: read$/m)
})

test('every action is pinned by a full commit hash', () => {
  const uses = [...ci.matchAll(/uses: (\S+)/g)]
  assert.ok(uses.length > 0)
  for (const use of uses) assert.match(use[1], /@[0-9a-f]{40}$/)
})

test('no run step interpolates event data', () => {
  const blocks = runBlocks(ci)
  assert.ok(blocks.length > 0)
  for (const block of blocks) assert.doesNotMatch(block, /\$\{\{\s*github\./)
})

test('the run block reader follows block scalars, folded or not', () => {
  const blocks = runBlocks(
    'jobs:\n  a:\n    steps:\n      - run: one\n      - run: |\n          two\n          three\n        env:\n          X: 1\n      - run: >-\n          four\n',
  )
  assert.deepEqual(blocks, ['one', '          two\n          three', '          four'])
})

test('check runs the doc links and the migration journal', () => {
  assert.match(ci, /check-doc-links\.mjs/)
  assert.match(ci, /check-migrations\.mjs --base/)
})

test('the migration journal is checked against the base branch and against the previous push', () => {
  assert.match(ci, /check-migrations\.mjs --base "origin\/\$BASE_REF"/)
  assert.match(ci, /BASE_REF: \$\{\{ github\.base_ref \}\}/)
  assert.match(ci, /check-migrations\.mjs --base "\$BEFORE_SHA"/)
  assert.match(ci, /BEFORE_SHA: \$\{\{ github\.event\.before \}\}/)
})

test('a push that creates a branch skips the journal check against the previous push', () => {
  assert.match(
    ci,
    /if: github\.event_name == 'push' && github\.event\.before != '0{40}'\n\s+run: node scripts\/check-migrations\.mjs --base "\$BEFORE_SHA"/,
  )
})

test('secrets scans the tree and the whole history', () => {
  assert.match(ci, /^ {2}secrets:$/m)
  assert.match(ci, /gitleaks dir/)
  assert.match(ci, /gitleaks git/)
  assert.match(ci, /pnpm audit --audit-level high/)
})

test('gitleaks is a pinned release binary, checked against its checksum', () => {
  assert.match(ci, /releases\/download\/v8\.30\.1\/gitleaks_8\.30\.1_linux_x64\.tar\.gz/)
  assert.match(ci, /[0-9a-f]{64} {2}gitleaks\.tar\.gz/)
  assert.match(ci, /sha256sum --check/)
  assert.match(ci, /gitleaks dir \. --redact --no-banner/)
  assert.match(ci, /gitleaks git \. --redact --no-banner/)
})

test('gitleaks keeps its default rules', () => {
  const gitleaks = read('../.gitleaks.toml')
  assert.match(gitleaks, /\[extend\]\s*\n\s*useDefault = true/)
})

/** The `[[allowlists]]` tables of the gitleaks configuration, each as its text and path entries. */
function gitleaksAllowlists() {
  return read('../.gitleaks.toml')
    .split('[[allowlists]]')
    .slice(1)
    .map((text) => {
      const list = /paths = \[([^\]]*)\]/.exec(text)
      assert.ok(list, 'an allowlist names its paths')
      const entries = [...list[1].matchAll(/'''(.*?)'''|"([^"]*)"/g)].map((m) => m[1] ?? m[2])
      assert.ok(entries.length > 0)
      // a path entry is a regular expression: strip its anchors and escapes before comparing
      const paths = entries.map((entry) =>
        entry.replace(/^\^/, '').replace(/\$$/, '').replaceAll('\\', ''),
      )
      return { text, paths }
    })
}

test('a history allowlist needs both a listed commit and a listed path', () => {
  const histories = gitleaksAllowlists().filter(({ text }) => text.includes('commits = ['))
  assert.equal(histories.length, 2)
  for (const { text } of histories) assert.match(text, /condition = "AND"/)
  const gitleaks = read('../.gitleaks.toml')
  for (const short of [
    '7e5f8cc',
    '4149f7b',
    '218ab5d',
    '382189a',
    '5965ad6',
    '3321ce2',
    '670cf95',
    '293b97a',
  ]) {
    assert.match(gitleaks, new RegExp(`"${short}[0-9a-f]{33}"`))
  }
})

test('the commit that once held the demo secret is allowed for the seed alone', () => {
  const seed = gitleaksAllowlists().find(({ text }) => text.includes('293b97a'))
  assert.deepEqual(seed.paths, ['packages/db/src/seed.ts'])
})

test('only the test fixtures are allowed by path alone, wherever a squash merge puts them', () => {
  const fixtures = gitleaksAllowlists().filter(({ text }) => !text.includes('commits = ['))
  assert.equal(fixtures.length, 1)
  assert.deepEqual(fixtures[0].paths.sort(), [
    'packages/db/src/totp.test.ts',
    'scripts/bff-boundary.test.mjs',
  ])
})

test('no allowlist covers a path beyond the files the hits are in', () => {
  const allowed = new Set([
    'apps/api/.env.example',
    'docs/PLAN.md',
    'packages/db/src/seed.ts',
    'packages/db/src/totp.test.ts',
    'scripts/bff-boundary.test.mjs',
  ])
  for (const { paths } of gitleaksAllowlists()) {
    for (const path of paths) assert.ok(allowed.has(path), `unexpected allowlist path ${path}`)
  }
})

/** The text of one job: from its name to the next job at the same depth. */
const job = (name) => {
  const start = ci.search(new RegExp(`^ {2}${name}:$`, 'm'))
  assert.notEqual(start, -1, name)
  const rest = ci.slice(start + 1)
  const end = rest.search(/^ {2}\S/m)
  return end === -1 ? rest : rest.slice(0, end)
}

test('check and e2e set up the stack with infra:init, before the database steps', () => {
  for (const name of ['check', 'e2e']) {
    const steps = job(name)
    const init = steps.indexOf('- run: pnpm infra:init')
    assert.notEqual(init, -1, name)
    assert.ok(init < steps.indexOf('- run: pnpm db:migrate'), name)
    assert.ok(init < steps.indexOf('pnpm db:seed'), name)
  }
})

test('no job starts the stack through compose', () => {
  assert.doesNotMatch(ci, /docker compose/)
})

test('the built api starts from the .env that infra:init wrote', () => {
  assert.match(job('check'), /node --env-file=apps\/api\/\.env apps\/api\/dist\/main\.js/)
  assert.doesNotMatch(ci, /--env-file=apps\/api\/\.env\.example/)
})

test('secrets reads the whole history', () => {
  const secrets = ci.slice(ci.search(/^ {2}secrets:$/m))
  assert.match(secrets, /fetch-depth: 0/)
})

test('a push runs the tests uncached', () => {
  assert.match(ci, /TURBO_FORCE: \$\{\{ github\.event_name == 'push' \}\}/)
})

test('a pull request runs the tests on what it affects', () => {
  assert.match(ci, /pnpm turbo run typecheck lint test \$TURBO_ARGS/)
  assert.match(
    ci,
    /TURBO_ARGS: \$\{\{ github\.event_name == 'pull_request' && '--affected' \|\| '' \}\}/,
  )
})

test('the ruleset requires check, e2e and secrets', () => {
  assert.deepEqual(requiredChecks(ruleset).sort(), ['check', 'e2e', 'secrets'])
})

test('the ruleset targets main, forbids deletion and force pushes and requires a pull request', () => {
  assert.equal(ruleset.name, 'protect-main')
  assert.equal(ruleset.target, 'branch')
  assert.deepEqual(ruleset.conditions.ref_name.include, ['refs/heads/main'])
  const types = ruleset.rules.map((rule) => rule.type)
  for (const type of ['deletion', 'non_fast_forward', 'pull_request'])
    assert.ok(types.includes(type))
  const pullRequest = ruleset.rules.find((rule) => rule.type === 'pull_request')
  assert.equal(pullRequest.parameters.required_approving_review_count, 0)
})

test('check builds both applications against the control address and scans them', () => {
  const steps = job('check')
  const build = steps.indexOf('- run: pnpm build')
  assert.notEqual(build, -1)
  const environment = steps.slice(build, steps.indexOf('- name: start the built api'))
  assert.match(environment, /VITE_API_URL: https:\/\/opos-control\.invalid/)
  assert.match(environment, /SUPABASE_SECRET_KEY: opos-canary-secret-x/)
  assert.ok(build < steps.indexOf('- run: node scripts/bff-boundary.mjs --dist'))
})

test('the build task hashes the control address, the canary and the .env files, so no cache stands in', () => {
  const { tasks } = JSON.parse(read('../turbo.json'))
  assert.ok(tasks.build.env.includes('VITE_API_URL'))
  assert.ok(tasks.build.env.includes('SUPABASE_SECRET_KEY'))
  assert.ok(!(tasks.build.passThroughEnv ?? []).includes('SUPABASE_SECRET_KEY'))
  assert.ok(tasks.build.inputs.includes('$TURBO_DEFAULT$'))
  assert.ok(tasks.build.inputs.includes('.env*'))
})

test('the BFF boundary check runs in a Claude Code hook and in lefthook pre-commit', () => {
  const { hooks } = JSON.parse(read('../.claude/settings.json'))
  const commands = (event, matcher) =>
    hooks[event]
      .filter((entry) => entry.matcher === matcher)
      .flatMap((e) => e.hooks.map((h) => h.command))
  const boundary = /scripts\/bff-boundary\.mjs --hook( \|\| exit 2)?$/
  for (const matcher of ['Edit|Write', 'Bash']) {
    assert.ok(
      commands('PostToolUse', matcher).some((command) => boundary.test(command)),
      matcher,
    )
  }
  assert.ok(commands('PostToolUseFailure', 'Bash').some((command) => boundary.test(command)))
  assert.match(read('../lefthook.yml'), /run: node scripts\/bff-boundary\.mjs \{staged_files\}/)
})
