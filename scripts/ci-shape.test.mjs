import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// The shape of the workflows and of the ruleset, read as text: a workflow is YAML and the root has
// no YAML parser, so the checks are regular expressions over the file.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const ci = read('../.github/workflows/ci.yml')
// The signed push to Coolify, which ci.yml and release-dev.yml call
const coolifyRelease = read('../.github/workflows/coolify-release.yml')
// Dev's release started by hand
const releaseDev = read('../.github/workflows/release-dev.yml')
const workflows = Object.fromEntries(
  readdirSync(new URL('../.github/workflows/', import.meta.url))
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => [name, read(`../.github/workflows/${name}`)]),
)
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

test('every workflow reads the repository and nothing more', () => {
  assert.deepEqual(Object.keys(workflows).sort(), [
    'ci.yml',
    'coolify-release.yml',
    'release-dev.yml',
  ])
  for (const [name, workflow] of Object.entries(workflows)) {
    assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m, name)
    assert.doesNotMatch(workflow, /id-token|: write$/m, name)
  }
  // No job of ci widens it: the remote cache comes from the secrets of an environment, not a
  // sign-in; and the job that calls the release grants the called workflow nothing more
  for (const workflow of [ci, coolifyRelease]) assert.doesNotMatch(workflow, /^ {4}permissions:/m)
})

test('every action is pinned by a full commit hash', () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    for (const use of workflow.matchAll(/uses: (\S+)/g)) {
      // A workflow of this repository, called at the commit that calls it
      if (use[1].startsWith('./.github/workflows/')) continue
      assert.match(use[1], /@[0-9a-f]{40}$/, name)
    }
  }
  assert.ok([...ci.matchAll(/uses: (\S+)@/g)].length > 0)
})

test('no run step interpolates event data', () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    const blocks = runBlocks(workflow)
    assert.ok(blocks.length > 0, name)
    for (const block of blocks) assert.doesNotMatch(block, /\$\{\{\s*github\./, name)
  }
})

test('the run block reader follows block scalars, folded or not', () => {
  const blocks = runBlocks(
    'jobs:\n  a:\n    steps:\n      - run: one\n      - run: |\n          two\n          three\n        env:\n          X: 1\n      - run: >-\n          four\n',
  )
  assert.deepEqual(blocks, ['one', '          two\n          three', '          four'])
})

test('no job installs the tools of the deploy commands', () => {
  const tools = read('../mise.toml').split('\n[tools]\n')[1].split(/\n\[/)[0]
  const names = [...tools.matchAll(/^(?!#)"?([^"=\s]+)"? = /gm)].map((match) => match[1])
  const deploy = names.filter((name) => !['node', 'aqua:supabase/cli'].includes(name))
  assert.ok(deploy.length > 0)
  const disabled = /^env:\n {2}MISE_DISABLE_TOOLS: (\S+)$/m.exec(ci)
  assert.ok(disabled, 'the workflow disables tools for every job')
  assert.deepEqual(disabled[1].split(',').sort(), deploy.sort())
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

// The checkout fetches every branch; the history scan reads the commit being checked and its
// ancestors alone, so another branch's commits never fail a run that does not carry them
test("secrets scans the checked commit's history, not every branch the checkout fetched", () => {
  const scans = [...ci.matchAll(/gitleaks git \. (.*)$/gm)].map((match) => match[1])
  assert.deepEqual(scans, ['--redact --no-banner --log-opts="--full-history HEAD"'])
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
  assert.equal(histories.length, 3)
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
    '053eb82',
  ]) {
    assert.match(gitleaks, new RegExp(`"${short}[0-9a-f]{33}"`))
  }
})

test('the commit that once held the demo secret is allowed for the seed alone', () => {
  const seed = gitleaksAllowlists().find(({ text }) => text.includes('293b97a'))
  assert.deepEqual(seed.paths, ['packages/db/src/seed.ts'])
})

test('the commit that wrote out the names of the secrets is allowed for the stack alone', () => {
  const names = gitleaksAllowlists().find(({ text }) => text.includes('053eb82'))
  assert.deepEqual(names.paths, ['infra/live/dev/terragrunt.stack.hcl'])
})

test('only the test fixtures are allowed by path alone, wherever a squash merge puts them', () => {
  const fixtures = gitleaksAllowlists().filter(({ text }) => !text.includes('commits = ['))
  assert.equal(fixtures.length, 1)
  assert.deepEqual(fixtures[0].paths.sort(), [
    'apps/api/src/modules/payments/przelewy24/account.test.ts',
    'apps/portal/src/features/shop/pages/order-link-page.test.tsx',
    'packages/db/src/totp.test.ts',
    'scripts/bff-boundary.test.mjs',
  ])
})

test('no allowlist covers a path beyond the files the hits are in', () => {
  const allowed = new Set([
    'apps/api/.env.example',
    'apps/api/src/modules/payments/przelewy24/account.test.ts',
    'apps/portal/src/features/shop/pages/order-link-page.test.tsx',
    'docs/PLAN.md',
    'infra/live/dev/terragrunt.stack.hcl',
    'packages/db/src/seed.ts',
    'packages/db/src/totp.test.ts',
    'scripts/bff-boundary.test.mjs',
  ])
  for (const { paths } of gitleaksAllowlists()) {
    for (const path of paths) assert.ok(allowed.has(path), `unexpected allowlist path ${path}`)
  }
})

/** The text of one job of a workflow, ci by default: from its name to the next job at the same depth. */
const job = (name, workflow = ci) => {
  const start = workflow.search(new RegExp(`^ {2}${name}:$`, 'm'))
  assert.notEqual(start, -1, name)
  const rest = workflow.slice(start + 1)
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

test('a pull request runs the tests on what it affects, and a push uncached, in each turbo step', () => {
  const steps = job('check')
  for (const tasks of ['typecheck lint', 'test']) {
    const start = steps.indexOf(`- run: pnpm turbo run ${tasks} \${TURBO_ARGS:+"$TURBO_ARGS"}`)
    assert.notEqual(start, -1, tasks)
    const step = steps.slice(start, steps.indexOf('\n      - ', start + 1))
    assert.match(
      step,
      /TURBO_ARGS: \$\{\{ github\.event_name == 'pull_request' && '--affected' \|\| '' \}\}/,
      tasks,
    )
    assert.match(step, /TURBO_FORCE: \$\{\{ github\.event_name == 'push' \}\}/, tasks)
    assert.match(step, /TURBO_SCM_BASE: /, tasks)
  }
})

/** The text of one step of a job, from the line that starts it to the next step. */
const step = (name, first) => {
  const steps = job(name)
  const start = steps.indexOf(first)
  assert.notEqual(start, -1, first)
  const end = steps.indexOf('\n      - ', start + 1)
  return end === -1 ? steps.slice(start) : steps.slice(start, end)
}

test('check enters the environment that writes to the remote cache only on a push, and records no deployment', () => {
  assert.match(
    job('check'),
    /^ {4}environment:\n {6}name: \$\{\{ github\.event_name == 'push' && 'cache-write' \|\| 'cache-read' \}\}\n {6}deployment: false\n {4}steps:$/m,
  )
  for (const name of ['e2e', 'secrets']) assert.doesNotMatch(job(name), /^ {4}environment:/m, name)
})

test('OpenTofu writes both environments of check, and only develop and main enter the one that writes', () => {
  const unit = read('../infra/live/dev/terragrunt.stack.hcl')
  assert.match(unit, /^ {6}"cache-write" += \{$/m)
  assert.match(unit, /^ {6}"cache-read" += \{$/m)
  const env = read('../infra/live/dev/env.yaml')
  const branches = /^ {2}write_branches:\n((?: {4}- \S+\n)+)/m.exec(env)
  assert.ok(branches, 'cache.write_branches in env.yaml')
  assert.deepEqual([...branches[1].matchAll(/- (\S+)/g)].map((match) => match[1]).sort(), [
    'develop',
    'main',
  ])
})

test('every step that runs turbo tasks gets the remote cache of its environment, and never an empty cache mode', () => {
  for (const first of [
    '- run: pnpm turbo run typecheck lint ${TURBO_ARGS:+"$TURBO_ARGS"}',
    '- run: pnpm turbo run test ${TURBO_ARGS:+"$TURBO_ARGS"}',
    '- run: pnpm build',
  ]) {
    const text = step('check', first)
    assert.match(text, /TURBO_API: \$\{\{ vars\.TURBO_API \}\}$/m, first)
    assert.match(text, /TURBO_TEAM: opos$/m, first)
    assert.match(text, /TURBO_TOKEN: \$\{\{ secrets\.TURBO_TOKEN \}\}$/m, first)
    assert.match(
      text,
      /TURBO_REMOTE_CACHE_SIGNATURE_KEY: \$\{\{ secrets\.TURBO_REMOTE_CACHE_SIGNATURE_KEY \}\}$/m,
      first,
    )
    // turbo reads an empty mode as "no cache at all"
    assert.match(
      text,
      /TURBO_CACHE: \$\{\{ github\.event_name == 'push' && 'local:rw,remote:rw' \|\| 'local:rw,remote:r' \}\}/,
      first,
    )
  }
})

test('no run step holds a secret', () => {
  for (const [name, workflow] of Object.entries(workflows)) {
    for (const block of runBlocks(workflow)) assert.doesNotMatch(block, /secrets\./, name)
  }
})

test('turbo signs what it stores in the remote cache and verifies what it takes from it', () => {
  assert.equal(JSON.parse(read('../turbo.json')).remoteCache.signature, true)
})

test('the tests get a step of their own, on a runner that also hosts the stack', () => {
  assert.doesNotMatch(ci, /turbo run [^\n]*\btest\b[^\n]*\b(typecheck|lint)\b/)
  assert.doesNotMatch(ci, /turbo run [^\n]*\b(typecheck|lint)\b[^\n]*\btest\b/)
  const steps = job('check')
  assert.ok(
    steps.indexOf('pnpm turbo run typecheck lint') < steps.indexOf('pnpm turbo run test'),
    'the tests run after typecheck and lint',
  )
})

test('the API tests wait for the schema tests, which hold table locks, with the settings of test', () => {
  const { tasks } = JSON.parse(read('../turbo.json'))
  const { dependsOn, ...settings } = tasks['@opos/api#test']
  assert.ok(dependsOn.includes('@opos/db#test'))
  const { dependsOn: shared, ...rest } = tasks.test
  for (const task of shared) assert.ok(dependsOn.includes(task), task)
  assert.deepEqual(settings, rest)
})

test('the API tests have time for several real sign-ins and for a hook that starts the API', () => {
  const config = read('../apps/api/vitest.config.ts')
  assert.match(config, /testTimeout: 15_000/)
  assert.match(config, /hookTimeout: 30_000/)
})

test('the API tests run on four workers at most, each a whole API with pools of its own', () => {
  const config = read('../apps/api/vitest.config.ts')
  assert.match(config, /const MAX_WORKERS = 4\n/)
  assert.match(
    config,
    /maxWorkers: Math\.max\(1, Math\.min\(MAX_WORKERS, availableParallelism\(\) - 1\)\),/,
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

// Coolify's API answers only the addresses its allowlist names, which leaves out GitHub's runners;
// its webhook does not, and takes only a push signed with the application's own secret
// (docs/adr/0075-release-dev-from-ci-through-a-signed-webhook.md)
test('the release job sends Coolify a signed push and holds no token of its API', () => {
  const release = job('release', coolifyRelease)
  assert.match(release, /"\$COOLIFY_URL\/webhooks\/source\/github\/events\/manual"/)
  assert.match(release, /X-GitHub-Event: push/)
  assert.match(release, /X-Hub-Signature-256: sha256=\$signature/)
  assert.match(
    release,
    /^ {10}COOLIFY_WEBHOOK_SECRET: \$\{\{ secrets\.COOLIFY_WEBHOOK_SECRET \}\}$/m,
  )
  assert.doesNotMatch(release, /api\/v1|COOLIFY_TOKEN|COOLIFY_APPLICATION|Authorization/)
})

test('the release job pins the commit its checks passed and signs it without the secret in argv', () => {
  const release = job('release', coolifyRelease)
  assert.match(release, /^ {10}COMMIT: \$\{\{ github\.sha \}\}$/m)
  assert.match(release, /after: \$commit/)
  // The key comes from the environment, never a command line another process could read
  assert.match(release, /os\.environ\["COOLIFY_WEBHOOK_SECRET"\]/)
  assert.doesNotMatch(release, /-hmac|hexkey|\$COOLIFY_WEBHOOK_SECRET/)
})

test('the release job fails on a failed pipe and on any reply but a queued deployment', () => {
  const release = job('release', coolifyRelease)
  // bash named as the shell runs with pipefail; the default shell does not
  assert.match(release, /^ {8}shell: bash$/m)
  assert.match(release, /select\(\.status == "success"\)/)
  assert.match(release, /::error::Coolify queued no deployment/)
})

test('the signed push is a workflow only other workflows call, in the environment dev', () => {
  assert.match(coolifyRelease, /^on:\n {2}workflow_call:\n\n/m)
  assert.doesNotMatch(coolifyRelease, /workflow_dispatch|^ {2}push:|pull_request/m)
  assert.match(job('release', coolifyRelease), /^ {4}environment:\n {6}name: dev$/m)
  // Only the head of the branch is released; a newer push releases itself
  assert.match(job('release', coolifyRelease), /git\/ref\/heads\/\$BRANCH/)
})

/** The jobs a job waits for, as written in its `needs: [...]`. */
const needs = (text) => {
  const list = /^ {4}needs: \[([^\]]*)\]$/m.exec(text)
  assert.ok(list, 'the job names what it waits for')
  return list[1].split(',').map((name) => name.trim())
}

test('ci releases a push to develop once its checks passed, through the signed push', () => {
  const release = job('release')
  assert.match(
    release,
    /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/develop'$/m,
  )
  assert.deepEqual(needs(release).sort(), ['check', 'e2e', 'images', 'secrets'])
  assert.match(release, /^ {4}uses: \.\/\.github\/workflows\/coolify-release\.yml$/m)
  assert.doesNotMatch(release, /steps:|COOLIFY_/)
})

test('release-dev runs only by hand, and only on develop', () => {
  assert.match(releaseDev, /^on:\n {2}workflow_dispatch:\n\n/m)
  assert.doesNotMatch(releaseDev, /^ {2}(push|pull_request|schedule|workflow_call):/m)
  for (const name of ['checks', 'release']) {
    assert.match(job(name, releaseDev), /^ {4}if: github\.ref == 'refs\/heads\/develop'$/m, name)
  }
})

// A release names a commit whose checks passed (docs/adr/0075-release-dev-from-ci-through-a-signed-webhook.md)
test("release-dev releases the head only once ci's checks of its push passed", () => {
  const checks = job('checks', releaseDev)
  // Reading the runs of the repository is the one permission beyond its contents
  assert.match(checks, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n {4}\S/m)
  assert.match(checks, /^ {10}COMMIT: \$\{\{ github\.sha \}\}$/m)
  assert.match(
    checks,
    /actions\/workflows\/ci\.yml\/runs\?event=push&branch=develop&head_sha=\$COMMIT/,
  )
  assert.match(checks, /jobs\?filter=latest/)
  const required = /^ {10}REQUIRED: (.+)$/m.exec(checks)
  assert.ok(required, 'the checks name the jobs they require')
  assert.deepEqual(required[1].split(' ').sort(), needs(job('release')).sort())
  assert.match(checks, /::error::/)

  const release = job('release', releaseDev)
  assert.deepEqual(needs(release), ['checks'])
  assert.match(release, /^ {4}uses: \.\/\.github\/workflows\/coolify-release\.yml$/m)
  assert.doesNotMatch(release, /^ {4}permissions:/m)
})

test('OpenTofu gives the release job the webhook secret, and the application takes its pushes', () => {
  const stack = read('../infra/live/dev/terragrunt.stack.hcl')
  assert.match(stack, /secrets += \{ COOLIFY_WEBHOOK_SECRET = local\.deployment\.webhook_secret \}/)
  assert.doesNotMatch(stack, /COOLIFY_TOKEN|COOLIFY_APPLICATION|release_token/)
  const env = read('../infra/live/dev/env.yaml')
  assert.match(env, /^ {2}webhook_secret: release-webhook-secret$/m)
  assert.match(env, /^ {4}release-webhook-secret: 1$/m)
  assert.doesNotMatch(env, /coolify-release-token/)
  const deployment = read('../infra/modules/deployment/main.tf')
  assert.match(deployment, /manual_webhook_secret_github = local\.secret\.release_webhook_secret/)
  assert.match(deployment, /is_auto_deploy_enabled += true/)
})

test('a unit puts off reading a generated secret it reads anew, or whose number rose, until the apply', () => {
  // A plan reads a secret the secrets unit has not written yet, or its version before a rotation,
  // unless a change planned beside the read puts it off
  const stack = read('../infra/live/dev/terragrunt.stack.hcl')
  for (const unit of ['deployment', 'github']) {
    const body = new RegExp(`^unit "${unit}" \\{\\n([\\s\\S]*?)^\\}$`, 'm').exec(stack)?.[1]
    assert.match(body ?? '', /^ {4}generated += local\.generated$/m, unit)
  }
  assert.match(stack, /^ {2}generated += try\(local\.env\.secrets\.generated, \{\}\)$/m)
  for (const module of ['deployment', 'github-actions']) {
    const main = read(`../infra/modules/${module}/main.tf`)
    assert.match(main, /if contains\(keys\(var\.generated\), name\)/, module)
    const data = /^data "scaleway_secret_version" "this" \{\n([\s\S]*?)^\}$/m.exec(main)?.[1]
    assert.match(data ?? '', /depends_on = \[terraform_data\.produced\]/, module)
  }
})
