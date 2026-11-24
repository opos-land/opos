import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ALLOWED, allows, findLicenceBreaches, main } from './deps-licenses.mjs'

const pkg = (name, versions = ['1.0.0']) => ({ name, versions })

describe('allows', () => {
  for (const id of ALLOWED) {
    it(`allows ${id}`, () => assert.equal(allows(id), true))
  }

  for (const id of [
    'GPL-3.0',
    'GPL-2.0-only',
    'LGPL-3.0-or-later',
    'AGPL-3.0',
    'SSPL-1.0',
    'BUSL-1.1',
    'CC-BY-NC-4.0',
    'Unknown',
    'SEE LICENSE IN LICENSE.md',
    '',
  ]) {
    it(`refuses ${JSON.stringify(id)}`, () => assert.equal(allows(id), false))
  }

  it('allows a choice when one side is allowed', () => {
    assert.equal(allows('(MIT OR GPL-3.0)'), true)
    assert.equal(allows('GPL-3.0 OR Apache-2.0'), true)
  })

  it('refuses a choice when no side is allowed', () => {
    assert.equal(allows('(GPL-2.0 OR AGPL-3.0)'), false)
  })

  it('allows a conjunction only when every side is allowed', () => {
    assert.equal(allows('MIT AND ISC AND BSD-3-Clause'), true)
    assert.equal(allows('MIT AND GPL-3.0'), false)
  })

  it('binds AND tighter than OR', () => {
    assert.equal(allows('GPL-3.0 AND MIT OR ISC'), true)
    assert.equal(allows('ISC OR MIT AND GPL-3.0'), true)
    assert.equal(allows('(ISC OR MIT) AND GPL-3.0'), false)
  })

  it('judges a licence with an exception by the licence itself', () => {
    assert.equal(allows('Apache-2.0 WITH LLVM-exception'), true)
    assert.equal(allows('GPL-2.0 WITH Classpath-exception-2.0'), false)
  })

  it('refuses an expression it cannot parse', () => {
    for (const text of ['(MIT', 'MIT)', 'MIT OR', 'AND MIT', 'MIT ISC', '()']) {
      assert.equal(allows(text), false, text)
    }
  })
})

describe('findLicenceBreaches', () => {
  it('finds nothing when every licence is allowed', () => {
    const report = { MIT: [pkg('a')], '(MIT OR Apache-2.0)': [pkg('b')] }

    assert.deepEqual(findLicenceBreaches(report), [])
  })

  it('names each refused package with its versions and licence', () => {
    const report = {
      MIT: [pkg('a')],
      'GPL-3.0': [pkg('copyleft', ['1.0.0', '2.1.0'])],
      Unknown: [pkg('nameless')],
    }

    assert.deepEqual(findLicenceBreaches(report), [
      'copyleft@1.0.0, 2.1.0: GPL-3.0',
      'nameless@1.0.0: Unknown',
    ])
  })

  it('refuses a report with no package, which proves nothing', () => {
    assert.throws(() => findLicenceBreaches({}), /no package/)
  })
})

describe('main', () => {
  const silence = () => mock.method(console, 'error', () => {})

  it('lists the licences of every dependency, development ones too', () => {
    const run = mock.fn(() => JSON.stringify({ MIT: [pkg('a')] }))

    assert.equal(main({ run }), 0)
    assert.deepEqual(run.mock.calls[0].arguments, [['licenses', 'list', '--json']])
  })

  it('fails and names the refused packages and the rule', () => {
    const errors = silence()
    const run = () => JSON.stringify({ MIT: [pkg('a')], 'AGPL-3.0': [pkg('b')] })

    assert.equal(main({ run }), 1)
    const printed = errors.mock.calls.map((call) => call.arguments[0]).join('\n')
    assert.match(printed, /b@1\.0\.0: AGPL-3\.0/)
    assert.match(printed, /docs\/ARCHITECTURE\.md/)
    errors.mock.restore()
  })

  it('fails when the licences cannot be listed', () => {
    const errors = silence()
    const run = () => {
      throw new Error('pnpm missing')
    }

    assert.equal(main({ run }), 1)
    assert.match(errors.mock.calls[0].arguments[0], /could not check.*pnpm missing/)
    errors.mock.restore()
  })

  it('fails on a report that is not JSON', () => {
    const errors = silence()

    assert.equal(main({ run: () => 'not json' }), 1)
    errors.mock.restore()
  })
})
