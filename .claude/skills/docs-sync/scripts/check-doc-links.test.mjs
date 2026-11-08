import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-doc-links.mjs')

let dir
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function repo(files) {
  dir = mkdtempSync(join(tmpdir(), 'doc-links-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' })
}

const base = {
  'AGENTS.md': '# Agents\n\nSee [the architecture](docs/ARCHITECTURE.md#tenant-isolation).\n',
  'README.md': '# Readme\n',
  'docs/PRODUCT.md': '# Product\n\n## 7. Modules\n\n[Architecture](ARCHITECTURE.md)\n',
  'docs/ARCHITECTURE.md': '# Architecture\n\n## Tenant isolation\n\n[Modules](PRODUCT.md#7-modules)\n',
}

describe('check-doc-links', () => {
  it('passes when every link of the documents resolves', () => {
    const run = repo(base)
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, /docs\/ARCHITECTURE\.md/)
  })

  it('checks docs/ARCHITECTURE.md without being told', () => {
    const run = repo({ ...base, 'docs/ARCHITECTURE.md': '# Architecture\n\n[Gone](plan/auth.md)\n' })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /docs\/ARCHITECTURE\.md: missing file plan\/auth\.md/)
  })

  it('checks the decision records and the specs without being told', () => {
    const run = repo({
      ...base,
      'docs/adr/0001-record-decisions.md': '# 0001. Record decisions\n\n[Gone](0009-missing.md)\n',
      'docs/specs/README.md': '# Specs\n\n[Rules](../PRODUCT.md#8-design)\n',
    })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /docs\/adr\/0001-record-decisions\.md: missing file 0009-missing\.md/)
    assert.match(run.stderr, /docs\/specs\/README\.md: missing anchor \.\.\/PRODUCT\.md#8-design/)
  })

  it('reports a missing anchor in another document', () => {
    const run = repo({ ...base, 'AGENTS.md': '# Agents\n\n[Cookies](docs/ARCHITECTURE.md#cookies)\n' })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /AGENTS\.md: missing anchor docs\/ARCHITECTURE\.md#cookies/)
  })
})
