import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { evaluate, Instance, Lazy, Opaque, shown } from './hcl.mjs'

const fixtures = []
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true })
})

/** A directory holding `files`, keyed by their path. */
function directory(files) {
  const dir = mkdtempSync(join(tmpdir(), 'hcl-'))
  fixtures.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

const secret = new Opaque('secret x')
const scope = {
  local: { env: { app: { host: 'a.example', list: ['x', 'y'] }, empty: null } },
  secret,
}
const value = (text, extra = {}) =>
  evaluate(text, { scope: { ...scope, ...extra }, root: '/repo', from: '/repo/x' })
const of = (text, extra) => {
  const result = value(text, extra)
  assert.ok(result.known, `${text} is known`)
  return result.value
}
const unknown = (text, extra) => assert.equal(value(text, extra).known, false, text)

describe('evaluate', () => {
  it('reads literals', () => {
    assert.deepEqual(value('plain'), { known: true, value: 'plain', overrides: [] })
    assert.equal(of('${12.5}'), 12.5)
    assert.equal(of('${true}'), true)
    assert.equal(of('${false}'), false)
    assert.equal(of('${null}'), null)
    assert.deepEqual(of('${[1, "a", []]}'), [1, 'a', []])
    assert.deepEqual(of('${{ a = 1, "b" : {} }}'), { a: 1, b: {} })
    assert.deepEqual(of('${{\n a = 1\n b = 2\n}}'), { a: 1, b: 2 })
    assert.deepEqual(of('${{ (local.env.app.host) = 1 }}'), { 'a.example': 1 })
    assert.deepEqual(of('${{ "k${1}" = 1 }}'), { k1: 1 })
    assert.equal(of('${"q\\"uote\\n\\t\\\\"}'), 'q"uote\n\t\\')
    assert.equal(of('${(1)}'), 1)
    assert.equal(of('$${literal}'), '${literal}')
  })

  it('skips comments', () => {
    assert.equal(of('${1 # one\n + 2}'), 3)
    assert.equal(of('${/* c */ 1 // two\n}'), 1)
    assert.equal(of('${1 # to the end}'), 1)
    unknown('${/* open }')
  })

  it('follows references, attributes and indexes', () => {
    assert.equal(of('${local.env.app.host}'), 'a.example')
    assert.equal(of('${local.env.app.list[1]}'), 'y')
    assert.equal(of('${local.env["app"].host}'), 'a.example')
    assert.equal(of('${local.env.empty}'), null)
    unknown('${local.env.nothing}')
    unknown('${local.env.empty.deeper}')
    unknown('${local.env.app.list[5]}')
    unknown('${values.x}')
    unknown('${local.env[local.none]}')
  })

  it('asks the context for a name its scope lacks', () => {
    const lookup = (name) => (name === 'x' ? { y: 1 } : undefined)
    assert.equal(evaluate('${x.y}', { scope: {}, lookup }).value, 1)
    assert.equal(evaluate('${z}', { scope: {}, lookup }).known, false)
  })

  it('calculates', () => {
    assert.equal(of('${1 + 2 * 3}'), 7)
    assert.equal(of('${(1 + 2) * 3 - 1}'), 8)
    assert.equal(of('${10 / 4}'), 2.5)
    assert.equal(of('${7 % 3}'), 1)
    assert.equal(of('${-1}'), -1)
    assert.equal(of('${!true}'), false)
    assert.equal(of('${1 < 2}'), true)
    assert.equal(of('${2 > 2}'), false)
    assert.equal(of('${2 >= 2 && 1 <= 0}'), false)
    assert.equal(of('${false || true}'), true)
    assert.equal(of('${"a" == "a"}'), true)
    assert.equal(of('${[1] == [1]}'), true)
    assert.equal(of('${1 != 2}'), true)
    assert.equal(of('${true ? "y" : "n"}'), 'y')
    assert.equal(of('${false ? "y" : 1 > 0 ? "m" : "n"}'), 'm')
    unknown('${"a" + 1}')
    unknown('${1 && true}')
    unknown('${!1}')
    unknown('${-"a"}')
    unknown('${"a" < 1}')
    unknown('${1 ? 2 : 3}')
    unknown('${secret == "a"}')
  })

  it('runs for expressions', () => {
    assert.deepEqual(of('${[for x in [1, 2, 3] : x * 2 if x > 1]}'), [4, 6])
    assert.deepEqual(of('${{ for k, v in { b = 1, a = 2 } : v => k }}'), { 2: 'a', 1: 'b' })
    assert.deepEqual(of('${[for k, v in { b = 1, a = 2 } : k]}'), ['a', 'b'])
    assert.deepEqual(of('${[for v in { b = 1, a = 2 } : v]}'), [2, 1])
    assert.deepEqual(of('${[for i, x in ["p", "q"] : i]}'), [0, 1])
    unknown('${{ for x in ["a", "a"] : x => x }}')
    unknown('${[for x in 1 : x]}')
    unknown('${{ for x in [] : x => x... }}')
    unknown('${[for x in [1] : x if 1]}')
  })

  it('fills templates and leaves them unknown when a part is', () => {
    assert.equal(of('https://${local.env.app.host}/'), 'https://a.example/')
    assert.equal(of('n${1}${true}'), 'n1true')
    unknown('x${local.env.app}')
    unknown('x${local.env.none}')
    unknown('x${null}')
    unknown('%{ if true }x%{ endif }')
  })

  it('runs the functions a stack uses', () => {
    assert.equal(of('${try(local.env.none, local.env.app.host)}'), 'a.example')
    unknown('${try(local.env.none)}')
    assert.deepEqual(value('${get_env("REF", local.env.app.host)}'), {
      known: true,
      value: 'a.example',
      overrides: ['REF'],
    })
    assert.deepEqual(value('${"${get_env("A", "a")}${get_env("B", "b")}"}').overrides, ['A', 'B'])
    unknown('${get_env("REF")}')
    unknown('${get_env(local.env.none, "x")}')
    unknown('${get_env("REF", local.none)}')
    assert.equal(of('${split("/", "a/b")[1]}'), 'b')
    assert.equal(of('${trimsuffix("a/", "/")}'), 'a')
    assert.equal(of('${trimsuffix("a", "/")}'), 'a')
    assert.equal(of('${trimprefix("/a", "/")}'), 'a')
    assert.equal(of('${trimprefix("a", "/")}'), 'a')
    assert.equal(of('${replace("a_b_c", "_", "-")}'), 'a-b-c')
    unknown('${replace("a", "/a/", "b")}')
    assert.equal(of('${get_repo_root()}/infra'), '/repo/infra')
    unknown('${nonesuch("a")}')
    unknown('${yamldecode("a: [")}')
    unknown('${split("/", local.env.none)}')
    unknown('${split("/", 1)}')
  })

  it('runs the functions a module uses', () => {
    assert.deepEqual(of('${merge({ a = 1 }, null, { b = 2 })}'), { a: 1, b: 2 })
    assert.deepEqual(of('${merge([{ a = 1 }, { b = 2 }]...)}'), { a: 1, b: 2 })
    unknown('${merge(1)}')
    unknown('${merge(1...)}')
    assert.deepEqual(of('${keys({ b = 1, a = 2 })}'), ['a', 'b'])
    assert.deepEqual(of('${values({ b = 1, a = 2 })}'), [2, 1])
    assert.equal(of('${length("abc")}'), 3)
    assert.equal(of('${length([1, 2])}'), 2)
    assert.equal(of('${length({ a = 1 })}'), 1)
    unknown('${length(1)}')
    assert.equal(of('${contains(["a"], "a")}'), true)
    assert.equal(of('${lookup({ a = 1 }, "a", 2)}'), 1)
    assert.equal(of('${lookup({ a = 1 }, "b", 2)}'), 2)
    unknown('${lookup({ a = 1 }, "b")}')
    assert.deepEqual(of('${concat([1], [2, 3])}'), [1, 2, 3])
    assert.deepEqual(of('${toset(["b", "a", "b"])}'), ['a', 'b'])
    assert.deepEqual(of('${tolist(["a"])}'), ['a'])
    assert.deepEqual(of('${tomap({ a = 1 })}'), { a: 1 })
    assert.deepEqual(of('${flatten([[1], [[2]], 3])}'), [1, 2, 3])
    assert.equal(of('${join(",", ["a", secret])}'), 'a,‹secret x›')
    assert.equal(of('${format("%s=%q %d%%", "a", "b", 3)}'), 'a="b" 3%')
    unknown('${format("%x", 1)}')
    assert.equal(
      of('${jsonencode({ b = [secret], a = { d = 1, c = null } })}'),
      '{"a":{"c":null,"d":1},"b":["‹secret x›"]}',
    )
    assert.deepEqual(of('${jsondecode("{\\"a\\":1}")}'), { a: 1 })
    assert.equal(of('${coalesce(null, "", "a")}'), 'a')
    unknown('${coalesce(null)}')
    assert.equal(of('${startswith("abc", "ab")}'), true)
    assert.equal(of('${endswith("abc", "bc")}'), true)
    assert.equal(of('${lower("A")}${upper("b")}${trimspace(" c ")}'), 'aBc')
    assert.equal(of('${sha256("a")}').length, 64)
    assert.equal(of('${base64decode(base64encode("a"))}'), 'a')
    assert.equal(of('${urlencode("a b/c")}'), 'a+b%2Fc')
    assert.equal(of('${tostring(1)}${tostring("a")}'), '1a')
    assert.equal(of('${can(local.none)}'), false)
    assert.equal(of('${can(1)}'), true)
  })

  it('carries what only a run knows through as itself', () => {
    assert.equal(of('p:${secret}'), 'p:‹secret x›')
    assert.equal(of('${secret}'), secret)
    for (const name of ['urlencode', 'base64decode', 'base64encode', 'tostring', 'lower']) {
      assert.equal(of(`\${${name}(secret)}`), secret, name)
    }
    assert.equal(of('${urlencode("a ${secret}")}'), 'a+‹secret x›')
    assert.equal(of('${sha256(secret)}').label, 'sha256 of secret x')
    assert.equal(of('${sha256("a ${secret}")}').label, 'sha256 of a value only a run knows')
    const attribute = of('${secret.inner}')
    assert.ok(attribute instanceof Opaque)
    assert.equal(attribute.label, 'secret x.inner')
    assert.equal(JSON.stringify({ secret }), '{"secret":"‹secret x›"}')
    assert.equal(String(secret), '‹secret x›')
    unknown('${merge(secret)}')
    unknown('${[for x in secret : x]}')
    unknown('${local.env[secret]}')
  })

  it('reads instances and lazy objects', () => {
    const instance = new Instance('res.this', (attribute) =>
      attribute === 'name' ? 'n' : undefined,
    )
    assert.equal(of('${res.name}', { res: instance }), 'n')
    const uuid = of('${res.uuid}', { res: instance })
    assert.equal(uuid.label, 'res.this.uuid')
    assert.equal(uuid.instance, instance)
    assert.equal(of('${res.uuid.more}', { res: instance }).instance, instance)
    const lazy = new Lazy(['a'], (key) => `${key}!`)
    assert.equal(of('${lazy.a}', { lazy }), 'a!')
    unknown('${lazy.b}', { lazy })
  })

  it('reads files, templates and YAML relative to where it evaluates', () => {
    const dir = directory({
      'a/env.yaml': 'k: v\n',
      'a/b/c/.keep': '',
      'a/t.tftpl': 'image: ${image}\nkeep: $${KEEP}\n',
      'a/d.tftpl': '%{ for x in xs }${x}%{ endfor }',
    })
    const from = join(dir, 'a/b/c')
    const at = (text) => evaluate(text, { scope: {}, root: dir, from })
    assert.equal(at('${find_in_parent_folders("env.yaml")}').value, join(dir, 'a/env.yaml'))
    assert.equal(at('${find_in_parent_folders("none.yaml")}').known, false)
    assert.deepEqual(at('${yamldecode(file(find_in_parent_folders("env.yaml")))}').value, {
      k: 'v',
    })
    assert.equal(at('${file("../../env.yaml")}').value, 'k: v\n')
    assert.equal(at('${file("missing")}').known, false)
    assert.equal(
      at('${templatefile("../../t.tftpl", { image = "i" })}').value,
      'image: i\nkeep: ${KEEP}\n',
    )
    assert.equal(at('${templatefile("../../t.tftpl", {})}').known, false)
    assert.equal(at('${templatefile("../../d.tftpl", { xs = [1] })}').known, false)
    const outside = evaluate('${find_in_parent_folders("none.yaml")}', {
      scope: {},
      root: join(dir, 'elsewhere'),
      from,
    })
    assert.equal(outside.known, false)
  })

  it('leaves what it cannot read unknown', () => {
    for (const text of [
      '${local.a == 1 ? 2 : 3}',
      '${"open',
      '${unclosed',
      '${[1,}',
      '${[1 2]}',
      '${{ a = 1 b }}',
      '${{ 1 = 2 }}',
      '${local.x.}',
      '${local.x[0}',
      '${f(1}',
      '${f(1 2)}',
      '${}',
      '${"${local.x"}',
      '${"\\u00e9"}',
      '${/* open',
      '${local.a local.b}',
      '${[local.none]}',
      '${{ a = local.none }}',
      '${1 ? }',
      '${a @ b}',
      '${[for x y]}',
      '${{ for k in [] : k }}',
    ]) {
      unknown(text)
    }
  })

  it('evaluates structures as a whole', () => {
    assert.deepEqual(of({ a: '${local.env.app.host}', b: [1, '${true}'] }), {
      a: 'a.example',
      b: [1, true],
    })
    unknown({ a: '${local.nothing}' })
    assert.equal(of(3), 3)
  })
})

describe('shown', () => {
  it('unwraps a lone interpolation and keeps the rest as written', () => {
    assert.equal(shown('${ local.a }'), 'local.a')
    assert.equal(shown('a${local.a}'), 'a${local.a}')
    assert.equal(shown('${open'), '${open')
    assert.equal(shown([1]), '[\n  1\n]')
  })
})
