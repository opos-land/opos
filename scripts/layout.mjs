// The layered layout of the pages of pnpm deploy:graph (scripts/deploy-graph.mjs): nodes in columns
// after what they depend on, ordered to keep edges apart.

const NODE = { width: 220, height: 92, columnGap: 120, rowGap: 36, margin: 32, passage: 18 }

/**
 * Columns and positions for `names` under `edges` ({ from, to }, `from` applied first): a unit
 * sits one column after the last of what it depends on. An edge that skips columns passes each of
 * them through a slot of its own, so that it runs beside the units there rather than behind them;
 * `routes` holds, by `from>to`, the two ends of each such slot. Units and slots are ordered within
 * their column by the rows of what they connect to, a few sweeps each way. `rounds` are the
 * columns in the order of `names`, the order Terragrunt can apply them in; units on a cycle are
 * named in `cycle` and put in a last column. Given `columns`, a map of each name to a number,
 * the nodes keep that order of columns instead, with the empty ones closed up.
 */
export function layoutGraph(names, edges, { columns: given = null } = {}) {
  const before = new Map(names.map((name) => [name, []]))
  for (const { from, to } of edges) before.get(to).push(from)
  let column = new Map()
  let cycle = []
  if (given) {
    const used = [...new Set(names.map((name) => given.get(name)))].sort((a, b) => a - b)
    column = new Map(names.map((name) => [name, used.indexOf(given.get(name))]))
  } else {
    let placed = true
    while (placed) {
      placed = false
      for (const name of names) {
        if (column.has(name) || !before.get(name).every((other) => column.has(other))) continue
        column.set(name, Math.max(-1, ...before.get(name).map((other) => column.get(other))) + 1)
        placed = true
      }
    }
    cycle = names.filter((name) => !column.has(name))
    const last = Math.max(-1, ...column.values()) + 1
    for (const name of cycle) column.set(name, last)
  }

  const columns = []
  for (const name of names) (columns[column.get(name)] ??= []).push(name)
  const rounds = columns.map((members) => [...members])

  // The slots of the edges that skip columns, and the links between neighbouring columns
  const links = []
  const passages = {}
  const slots = new Set()
  for (const { from, to } of edges) {
    const key = `${from}>${to}`
    passages[key] = []
    let previous = from
    for (let index = column.get(from) + 1; index < column.get(to); index++) {
      const slot = `${key}#${index}`
      column.set(slot, index)
      columns[index].push(slot)
      slots.add(slot)
      passages[key].push(slot)
      links.push([previous, slot])
      previous = slot
    }
    if (column.get(previous) < column.get(to)) links.push([previous, to])
  }

  const row = new Map()
  const number = () =>
    columns.forEach((members) => members.forEach((id, index) => row.set(id, index)))
  const sweep = (members, neighbours) => {
    const order = members.map((id, index) => {
      const rows = neighbours(id).map((other) => row.get(other))
      const centre = rows.length === 0 ? index : rows.reduce((a, b) => a + b, 0) / rows.length
      return { id, index, centre }
    })
    order.sort((a, b) => a.centre - b.centre || a.index - b.index)
    members.splice(0, members.length, ...order.map(({ id }) => id))
    number()
  }
  const previousOf = (id) => links.filter(([, to]) => to === id).map(([from]) => from)
  const nextOf = (id) => links.filter(([from]) => from === id).map(([, to]) => to)
  number()
  for (let pass = 0; pass < 4; pass++) {
    for (const members of columns.slice(1)) sweep(members, previousOf)
    for (const members of columns.slice(0, -1).reverse()) sweep(members, nextOf)
  }
  for (const members of columns.slice(1)) sweep(members, previousOf)

  // Positions: a column's units and slots stacked, every column centred on the tallest
  const size = (id) => (slots.has(id) ? NODE.passage : NODE.height)
  const heightOf = (members) =>
    members.reduce((sum, id) => sum + size(id), 0) + Math.max(0, members.length - 1) * NODE.rowGap
  const tallest = Math.max(0, ...columns.map(heightOf))
  const nodes = {}
  const middle = new Map()
  columns.forEach((members, index) => {
    const x = NODE.margin + index * (NODE.width + NODE.columnGap)
    let y = NODE.margin + (tallest - heightOf(members)) / 2
    for (const id of members) {
      if (!slots.has(id)) {
        nodes[id] = { column: index, x, y, width: NODE.width, height: NODE.height }
      }
      middle.set(id, [x, y + size(id) / 2])
      y += size(id) + NODE.rowGap
    }
  })
  const routes = Object.fromEntries(
    Object.entries(passages).map(([key, through]) => [
      key,
      through.flatMap((slot) => {
        const [x, y] = middle.get(slot)
        return [
          [x, y],
          [x + NODE.width, y],
        ]
      }),
    ]),
  )
  return {
    nodes,
    routes,
    rounds,
    cycle,
    width:
      NODE.margin * 2 +
      columns.length * NODE.width +
      Math.max(0, columns.length - 1) * NODE.columnGap,
    height: NODE.margin * 2 + tallest,
  }
}
