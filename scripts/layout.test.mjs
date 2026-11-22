import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { layoutGraph } from './layout.mjs'

describe('layoutGraph', () => {
  it('places each unit a column after what it depends on', () => {
    const { nodes, rounds, cycle, width, height } = layoutGraph(
      ['c', 'b', 'a', 'd'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
        { from: 'a', to: 'd' },
      ],
    )
    assert.deepEqual(rounds, [['a'], ['b', 'd'], ['c']])
    assert.deepEqual(cycle, [])
    assert.equal(nodes.a.column, 0)
    assert.equal(nodes.c.column, 2)
    assert.ok(nodes.b.x > nodes.a.x && nodes.c.x > nodes.b.x)
    assert.notEqual(nodes.b.y, nodes.d.y)
    assert.ok(width > nodes.c.x && height > Math.max(nodes.b.y, nodes.d.y))
  })

  it('routes an edge that skips a column through it, beside what stands there', () => {
    const { nodes, routes } = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    )
    assert.deepEqual(routes['a>b'], [])
    const [[x1, y1], [x2, y2]] = routes['a>c']
    assert.equal(x1, nodes.b.x)
    assert.equal(x2, nodes.b.x + nodes.b.width)
    assert.equal(y1, y2)
    assert.ok(y1 < nodes.b.y || y1 > nodes.b.y + nodes.b.height)
  })

  it('orders a column after the units feeding it', () => {
    const { nodes } = layoutGraph(
      ['x', 'y', 'p', 'q'],
      [
        { from: 'y', to: 'p' },
        { from: 'x', to: 'q' },
      ],
    )
    assert.ok(nodes.x.y < nodes.y.y)
    assert.ok(nodes.q.y < nodes.p.y)
  })

  it('places each node in the column it is given, closing the gaps', () => {
    const { nodes, routes, rounds } = layoutGraph(['a', 'b', 'c'], [{ from: 'a', to: 'c' }], {
      columns: new Map([
        ['a', 0],
        ['b', 3],
        ['c', 5],
      ]),
    })
    assert.deepEqual(
      ['a', 'b', 'c'].map((name) => nodes[name].column),
      [0, 1, 2],
    )
    assert.deepEqual(rounds, [['a'], ['b'], ['c']])
    assert.equal(routes['a>c'].length, 2)
  })

  it('places nothing', () => {
    const { nodes, rounds, width, height } = layoutGraph([], [])
    assert.deepEqual([nodes, rounds], [{}, []])
    assert.ok(width > 0 && height > 0)
  })

  it('names the units of a cycle and still places them', () => {
    const { nodes, cycle, rounds } = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    )
    assert.deepEqual(cycle, ['a', 'b'])
    assert.deepEqual(rounds, [['c'], ['a', 'b']])
    assert.equal(nodes.a.column, 1)
  })
})
