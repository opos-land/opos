import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import {
  MAX_ITEM_PICTURES,
  MAX_ITEM_VARIANTS,
  MAX_MERCHANDISE_IMAGE_SIZE,
  MAX_MERCHANDISE_ITEMS,
  type MerchandiseItem,
} from '@opos/contract'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileKey } from '../src/modules/files/owners'
import { createApp } from './app'
import { deleteCreatedAccounts, session } from './auth'
import { objectKeys, upload } from './files'
import { pdf, png } from './pictures'
import {
  addDocument,
  addEdition,
  addEditionAccess,
  addMerchandiseItem,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  member,
  type Member,
  setPublished,
  storedFiles,
  storedRows,
  suspend,
  tenantWithHead,
} from './tenants'

// The merchandise of an edition (docs/specs/0003-catalog.md): items with their option axes, the
// variants that exist and their stock, pictures and size charts, behind the tickets permission of
// the edition, and the route that serves a shown item's pictures to everyone. Which permission
// each route needs is checked in route-requirements.test.ts; these cover what the routes do.

type Tenant = Awaited<ReturnType<typeof tenantWithHead>>
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

let app: NestExpressApplication
let b: Tenant
let editionB: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  b = await tenantWithHead()
  editionB = await addEdition(b.id)
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await closeTenantDb()
  await app.close()
})

const call = (
  who: Member,
  method: Method,
  path: string,
  body: object | undefined,
  slug: string,
) => {
  const agent = request(app.getHttpServer())
  const req = agent[method](path).use(session(who.token)).set('X-Tenant-Slug', slug)
  return body ? req.send(body) : req
}

const anyone = () => request(app.getHttpServer())

/** A tenant of its own with one edition, so that a test changes nothing another reads. */
async function convention() {
  const t = await tenantWithHead()
  const edition = await addEdition(t.id)
  const as = (method: Method, path: string, body?: object, who: Member = t.head) =>
    call(who, method, `/editions/${edition}${path}`, body, t.slug)
  return { t, edition, as }
}

type Convention = Awaited<ReturnType<typeof convention>>

const item = (res: { body: unknown }) => res.body as MerchandiseItem
const items = (res: { body: unknown }) => res.body as MerchandiseItem[]

const mug = { name: 'Mug', amountMinor: 3500, perOrderLimit: 4 }
const shirt = {
  name: 'T-shirt',
  amountMinor: 8000,
  perOrderLimit: 5,
  axes: [
    { name: 'Cut', values: [{ label: "Women's" }, { label: "Men's" }] },
    { name: 'Size', values: [{ label: 'S' }, { label: 'M' }] },
  ],
}

/** A T-shirt with its two axes, as the API made it. */
const addShirt = async (c: Convention) => item(await c.as('post', '/merchandise-items', shirt))

/** The identifier of a value of an item, by its label. */
const valueOf = (of: MerchandiseItem, label: string) =>
  of.axes.flatMap((axis) => axis.values).find((value) => value.label === label)!.id

const combination = (of: MerchandiseItem, ...labels: string[]) => ({
  valueIds: labels.map((label) => valueOf(of, label)),
})

/** The variants of an item as the labels of their values, with their stock. */
const variantsOf = (of: MerchandiseItem) =>
  of.variants.map((variant) => ({
    labels: of.axes.map(
      (axis) => axis.values.find((value) => variant.valueIds.includes(value.id))!.label,
    ),
    stock: variant.stock,
    hidden: variant.hidden,
  }))

const picture = (width = 800, height = 600, name = 'shirt.png') =>
  upload(png(width, height), 'image/png', name)

describe('a merchandise item', () => {
  it('without axes is sold as one variant, out of stock until an org enters a number', async () => {
    const c = await convention()

    const res = await c.as('post', '/merchandise-items', { ...mug, name: ' Mug ' }).expect(201)

    expect(res.body).toEqual({
      id: expect.any(String) as string,
      editionId: c.edition,
      name: 'Mug',
      description: '',
      amountMinor: 3500,
      perOrderLimit: 4,
      picturesIllustrative: false,
      position: 1,
      hidden: false,
      axes: [],
      variants: [{ id: expect.any(String) as string, valueIds: [], stock: 0, hidden: false }],
      pictures: [],
    })
    expect(items(await c.as('get', '/merchandise-items'))).toEqual([res.body])
  })

  it('with axes holds their values in order, and no variant until an org says which exist', async () => {
    const c = await convention()

    const made = await addShirt(c)

    expect(made.axes.map((axis) => [axis.name, axis.values.map((value) => value.label)])).toEqual([
      ['Cut', ["Women's", "Men's"]],
      ['Size', ['S', 'M']],
    ])
    expect(made.axes[0]!.values[0]).toEqual({
      id: expect.any(String) as string,
      label: "Women's",
      sizeChart: null,
    })
    expect(made.variants).toEqual([])
  })

  it.each([
    ['a blank name', { name: ' ' }],
    ['a price below zero', { amountMinor: -1 }],
    ['a limit an order below one', { perOrderLimit: 0 }],
    ['a limit an order over 100', { perOrderLimit: 101 }],
    ['an axis without a value', { axes: [{ name: 'Size', values: [] }] }],
    ['an axis without a name', { axes: [{ name: ' ', values: [{ label: 'M' }] }] }],
    [
      'two axes of one name',
      {
        axes: [
          { name: 'Size', values: [{ label: 'M' }] },
          { name: ' size ', values: [{ label: 'L' }] },
        ],
      },
    ],
    [
      'a value twice in an axis',
      { axes: [{ name: 'Size', values: [{ label: 'M' }, { label: 'm' }] }] },
    ],
    [
      'more axes than an item may have',
      { axes: ['A', 'B', 'C', 'D'].map((name) => ({ name, values: [{ label: '1' }] })) },
    ],
    ['a field of shipping', { shippingMinor: 1500 }],
  ])('is not added with %s', async (_, values) => {
    const c = await convention()

    const res = await c.as('post', '/merchandise-items', { ...mug, ...values }).expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedRows('merchandise_items', c.t.id)).toEqual([])
  })

  it('changes what it is called and costs, moves, and is hidden and shown', async () => {
    const c = await convention()
    await c.as('post', '/merchandise-items', mug).expect(201)
    const second = item(await c.as('post', '/merchandise-items', { ...mug, name: 'Pin' }))

    const changed = await c
      .as('patch', `/merchandise-items/${second.id}`, {
        name: 'Enamel pin',
        description: 'Hard enamel, 3 cm.',
        amountMinor: 1200,
        perOrderLimit: 10,
        picturesIllustrative: true,
        position: 1,
        hidden: true,
      })
      .expect(200)

    expect(changed.body).toMatchObject({
      name: 'Enamel pin',
      description: 'Hard enamel, 3 cm.',
      amountMinor: 1200,
      perOrderLimit: 10,
      picturesIllustrative: true,
      position: 1,
      hidden: true,
    })
    const list = items(await c.as('get', '/merchandise-items'))
    expect(list.map((listed) => listed.name)).toEqual(['Enamel pin', 'Mug'])
    expect(
      item(await c.as('patch', `/merchandise-items/${second.id}`, { hidden: false })).hidden,
    ).toBe(false)
  })

  it('is deleted with everything of its own, and the rest close ranks', async () => {
    const c = await convention()
    const made = await addShirt(c)
    await c.as('put', `/merchandise-items/${made.id}/variants`, {
      variants: [combination(made, "Women's", 'S')],
    })
    await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture() }).expect(201)
    await c
      .as(
        'put',
        `/merchandise-items/${made.id}/option-values/${valueOf(made, "Women's")}/size-chart`,
        {
          file: picture(),
        },
      )
      .expect(200)
    const second = item(await c.as('post', '/merchandise-items', mug))
    const files = [
      ...(await storedFiles(c.t.id, 'merchandise-picture')),
      ...(await storedFiles(c.t.id, 'merchandise-size-chart')),
    ]
    expect(files).toHaveLength(2)

    await c.as('delete', `/merchandise-items/${made.id}`).expect(204)

    expect(items(await c.as('get', '/merchandise-items'))).toMatchObject([
      { id: second.id, position: 1 },
    ])
    for (const table of [
      'merchandise_option_axes',
      'merchandise_item_pictures',
      'uploaded_files',
    ]) {
      expect(await storedRows(table, c.t.id)).toEqual([])
    }
    for (const file of files) {
      expect(await objectKeys(fileKey('edition', c.t.id, file.id))).toEqual([])
    }
  })

  it('of another edition or another convention is unknown', async () => {
    const c = await convention()
    const theirs = await addMerchandiseItem(b.id, editionB)
    const elsewhere = await addMerchandiseItem(c.t.id, await addEdition(c.t.id))

    for (const id of [theirs.id, elsewhere.id, randomUUID(), 'no-uuid']) {
      await c.as('patch', `/merchandise-items/${id}`, { name: 'Mine now' }).expect(404)
      await c.as('delete', `/merchandise-items/${id}`).expect(404)
      await c.as('put', `/merchandise-items/${id}/variants`, { variants: [] }).expect(404)
      await c.as('post', `/merchandise-items/${id}/pictures`, { file: picture() }).expect(404)
    }
    await c
      .as('put', `/merchandise-items/${theirs.id}/variants/${theirs.variantId}/stock`, { stock: 9 })
      .expect(404)
    expect(await storedRows('merchandise_variants', b.id)).toMatchObject([{ stock: 0 }])
    // What a refused upload received belongs to nothing: no row keeps it.
    expect(await storedFiles(c.t.id, 'merchandise-picture')).toEqual([])
  })

  it('is held up to the limit of an edition', async () => {
    const c = await convention()
    for (let n = 0; n < MAX_MERCHANDISE_ITEMS; n += 1) await addMerchandiseItem(c.t.id, c.edition)

    const res = await c.as('post', '/merchandise-items', mug).expect(409)

    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_MERCHANDISE_ITEMS },
    })
  })
})

describe('the axes of an item', () => {
  const withVariants = async (c: Convention) => {
    const made = await addShirt(c)
    const res = await c.as('put', `/merchandise-items/${made.id}/variants`, {
      variants: [
        combination(made, "Women's", 'S'),
        combination(made, "Women's", 'M'),
        combination(made, "Men's", 'M'),
      ],
    })
    return item(res)
  }
  const axesOf = (of: MerchandiseItem) =>
    of.axes.map((axis) => ({
      id: axis.id,
      name: axis.name,
      values: axis.values.map((value) => ({ id: value.id, label: value.label })),
    }))

  it('are renamed and reordered, their values too, and the variants stay', async () => {
    const c = await convention()
    const made = await withVariants(c)
    const [cut, size] = axesOf(made)

    const res = await c
      .as('patch', `/merchandise-items/${made.id}`, {
        axes: [
          { ...size!, name: 'Rozmiar', values: [...size!.values].reverse() },
          { ...cut!, values: [{ ...cut!.values[0]!, label: 'Fitted' }, cut!.values[1]!] },
        ],
      })
      .expect(200)

    const changed = item(res)
    expect(
      changed.axes.map((axis) => [axis.name, axis.values.map((value) => value.label)]),
    ).toEqual([
      ['Rozmiar', ['M', 'S']],
      ['Cut', ['Fitted', "Men's"]],
    ])
    expect(changed.axes.map((axis) => axis.id)).toEqual([size!.id, cut!.id])
    expect(changed.variants.map((variant) => variant.id).sort()).toEqual(
      made.variants.map((variant) => variant.id).sort(),
    )
  })

  it('gain a value without touching a variant, and lose one with the variants that held it', async () => {
    const c = await convention()
    const made = await withVariants(c)
    const [cut, size] = axesOf(made)

    const grown = item(
      await c.as('patch', `/merchandise-items/${made.id}`, {
        axes: [cut!, { ...size!, values: [...size!.values, { label: 'L' }] }],
      }),
    )
    expect(grown.axes[1]!.values.map((value) => value.label)).toEqual(['S', 'M', 'L'])
    expect(grown.variants).toHaveLength(3)

    const shrunk = item(
      await c.as('patch', `/merchandise-items/${made.id}`, {
        axes: [cut!, { ...size!, values: [size!.values[1]!] }],
      }),
    )
    expect(variantsOf(shrunk).map((variant) => variant.labels)).toEqual([
      ["Women's", 'M'],
      ["Men's", 'M'],
    ])
  })

  it('once one is added or taken away, no variant fits them: every variant goes', async () => {
    const c = await convention()
    const made = await withVariants(c)
    const [cut, size] = axesOf(made)

    const wider = item(
      await c.as('patch', `/merchandise-items/${made.id}`, {
        axes: [cut!, size!, { name: 'Colour', values: [{ label: 'Black' }] }],
      }),
    )
    expect(wider.axes).toHaveLength(3)
    expect(wider.variants).toEqual([])

    // An item without axes is sold as one variant again.
    const bare = item(await c.as('patch', `/merchandise-items/${made.id}`, { axes: [] }))
    expect(bare.axes).toEqual([])
    expect(bare.variants).toMatchObject([{ valueIds: [], stock: 0 }])
  })

  it('take no axis or value of another item', async () => {
    const c = await convention()
    const made = await addShirt(c)
    const other = await addShirt(c)
    const [cut] = axesOf(made)
    const [theirCut] = axesOf(other)

    for (const axes of [
      [theirCut!],
      [{ ...cut!, values: [theirCut!.values[0]!] }],
      [{ id: randomUUID(), name: 'Size', values: [{ label: 'M' }] }],
    ]) {
      const res = await c.as('patch', `/merchandise-items/${made.id}`, { axes }).expect(400)
      expect(res.body).toMatchObject({ code: 'request.invalid' })
    }
    expect(axesOf(item(await c.as('patch', `/merchandise-items/${made.id}`, {})))).toEqual(
      axesOf(made),
    )
  })
})

describe('the variants of an item', () => {
  it('are the combinations an org says exist, each out of stock until a number is entered', async () => {
    const c = await convention()
    const made = await addShirt(c)

    const res = await c
      .as('put', `/merchandise-items/${made.id}/variants`, {
        variants: [combination(made, "Women's", 'S'), combination(made, 'M', "Men's")],
      })
      .expect(200)

    expect(variantsOf(item(res))).toEqual([
      { labels: ["Women's", 'S'], stock: 0, hidden: false },
      { labels: ["Men's", 'M'], stock: 0, hidden: false },
    ])
  })

  it('keep their stock when the list is put again, and go when it leaves them out', async () => {
    const c = await convention()
    const made = await addShirt(c)
    const first = item(
      await c.as('put', `/merchandise-items/${made.id}/variants`, {
        variants: [combination(made, "Women's", 'S'), combination(made, "Men's", 'M')],
      }),
    )
    const kept = first.variants[0]!
    await c.as('put', `/merchandise-items/${made.id}/variants/${kept.id}/stock`, { stock: 12 })

    const again = item(
      await c.as('put', `/merchandise-items/${made.id}/variants`, {
        variants: [
          { ...combination(made, "Women's", 'S'), hidden: true },
          combination(made, "Women's", 'M'),
        ],
      }),
    )

    expect(variantsOf(again)).toEqual([
      { labels: ["Women's", 'S'], stock: 12, hidden: true },
      { labels: ["Women's", 'M'], stock: 0, hidden: false },
    ])
    expect(again.variants[0]!.id).toBe(kept.id)
  })

  it.each([
    ['a value of each axis but one', (of: MerchandiseItem) => [{ valueIds: [valueOf(of, 'S')] }]],
    [
      'two values of one axis',
      (of: MerchandiseItem) => [{ valueIds: [valueOf(of, 'S'), valueOf(of, 'M')] }],
    ],
    [
      'a combination twice',
      (of: MerchandiseItem) => [combination(of, "Women's", 'S'), combination(of, 'S', "Women's")],
    ],
    [
      'a value that is no value of the item',
      (of: MerchandiseItem) => [{ valueIds: [valueOf(of, 'S'), randomUUID()] }],
    ],
  ])('are refused with %s, and the list stays', async (_, build) => {
    const c = await convention()
    const made = await addShirt(c)

    const res = await c
      .as('put', `/merchandise-items/${made.id}/variants`, { variants: build(made) })
      .expect(400)

    expect(res.body).toMatchObject({ code: 'request.invalid' })
    expect(await storedRows('merchandise_variants', c.t.id)).toEqual([])
  })

  it('of an item without axes are its one variant, which no list replaces', async () => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))

    await c.as('put', `/merchandise-items/${made.id}/variants`, { variants: [] }).expect(400)

    expect(await storedRows('merchandise_variants', c.t.id)).toHaveLength(1)
  })

  it('are held up to the limit of an item', async () => {
    const c = await convention()
    const sizes = Array.from({ length: 26 }, (_, n) => ({ label: `S${n}` }))
    const made = item(
      await c.as('post', '/merchandise-items', {
        ...mug,
        axes: [
          { name: 'Cut', values: ['A', 'B', 'C', 'D'].map((label) => ({ label })) },
          { name: 'Size', values: sizes },
        ],
      }),
    )
    const all = made.axes[0]!.values.flatMap((cut) =>
      made.axes[1]!.values.map((size) => ({ valueIds: [cut.id, size.id] })),
    )
    expect(all.length).toBeGreaterThan(MAX_ITEM_VARIANTS)

    const res = await c.as('put', `/merchandise-items/${made.id}/variants`, { variants: all })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_ITEM_VARIANTS },
    })
    await c
      .as('put', `/merchandise-items/${made.id}/variants`, {
        variants: all.slice(0, MAX_ITEM_VARIANTS),
      })
      .expect(200)
  })
})

describe('the stock of a variant', () => {
  it('is a number an org enters, or none while the variant is unlimited', async () => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))
    const at = `/merchandise-items/${made.id}/variants/${made.variants[0]!.id}/stock`

    expect(item(await c.as('put', at, { stock: 40 }).expect(200)).variants[0]!.stock).toBe(40)
    expect(item(await c.as('put', at, { stock: null }).expect(200)).variants[0]!.stock).toBeNull()
    expect(item(await c.as('put', at, { stock: 0 }).expect(200)).variants[0]!.stock).toBe(0)
  })

  it.each([
    ['below zero', { stock: -1 }],
    ['a fraction', { stock: 1.5 }],
    ['left out', {}],
  ])('is refused when it is %s', async (_, body) => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))

    await c
      .as('put', `/merchandise-items/${made.id}/variants/${made.variants[0]!.id}/stock`, body)
      .expect(400)
  })

  it('is set for a variant of the item the path names, and no other', async () => {
    const c = await convention()
    const [first, second] = [
      item(await c.as('post', '/merchandise-items', mug)),
      item(await c.as('post', '/merchandise-items', mug)),
    ]

    await c
      .as('put', `/merchandise-items/${first.id}/variants/${second.variants[0]!.id}/stock`, {
        stock: 5,
      })
      .expect(404)
    await c
      .as('put', `/merchandise-items/${first.id}/variants/${randomUUID()}/stock`, { stock: 5 })
      .expect(404)
  })
})

describe('the pictures of an item', () => {
  it('are images added one at a time, in their order, each with its file', async () => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))

    await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture(800, 600) })
    const res = await c
      .as('post', `/merchandise-items/${made.id}/pictures`, { file: picture(300, 900) })
      .expect(201)

    const { pictures } = item(res)
    expect(pictures).toEqual([
      {
        id: expect.any(String) as string,
        fileId: expect.any(String) as string,
        width: 800,
        height: 600,
      },
      {
        id: expect.any(String) as string,
        fileId: expect.any(String) as string,
        width: 300,
        height: 900,
      },
    ])
    expect(
      (await storedFiles(c.t.id, 'merchandise-picture')).map((file) => file.editionId),
    ).toEqual([c.edition, c.edition])
    // The small variant is made with the upload, the large one by its first read.
    const key = fileKey('edition', c.t.id, pictures[0]!.fileId)
    expect(await objectKeys(key)).toEqual([`${key}master`, `${key}small`])
  })

  it('are put in another order with the item, and only all of them at once', async () => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))
    for (const width of [100, 200, 300]) {
      await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture(width, 100) })
    }
    const before = item(await c.as('patch', `/merchandise-items/${made.id}`, {})).pictures
    const ids = before.map((shot) => shot.id)

    const moved = item(
      await c.as('patch', `/merchandise-items/${made.id}`, {
        pictureIds: [ids[2], ids[0], ids[1]],
      }),
    )
    expect(moved.pictures.map((shot) => shot.width)).toEqual([300, 100, 200])

    for (const pictureIds of [
      [ids[0], ids[1]],
      [ids[0], ids[0], ids[1]],
      [...ids, randomUUID()],
    ]) {
      await c.as('patch', `/merchandise-items/${made.id}`, { pictureIds }).expect(400)
    }
  })

  it('are removed one at a time, the file with the picture', async () => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))
    await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture() })
    const { pictures } = item(
      await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture(200, 200) }),
    )

    await c.as('delete', `/merchandise-items/${made.id}/pictures/${pictures[0]!.id}`).expect(204)

    const left = item(await c.as('patch', `/merchandise-items/${made.id}`, {})).pictures
    expect(left).toEqual([pictures[1]])
    expect(await storedFiles(c.t.id, 'merchandise-picture')).toMatchObject([
      { id: pictures[1]!.fileId },
    ])
    expect(await objectKeys(fileKey('edition', c.t.id, pictures[0]!.fileId))).toEqual([])
    await c.as('delete', `/merchandise-items/${made.id}/pictures/${pictures[0]!.id}`).expect(404)
  })

  it.each([
    ['a PDF', upload(pdf(), 'application/pdf', 'shirt.pdf'), 422, 'file.type-refused'],
    ['a PDF sent as a PNG', upload(pdf(), 'image/png', 'shirt.png'), 422, 'file.type-refused'],
    [
      'an SVG, which the storage does not keep at all',
      upload(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'image/svg+xml',
        'shirt.svg',
      ),
      422,
      'file.type-refused',
    ],
    [
      'an SVG sent as a PNG',
      upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'shirt.png'),
      422,
      'file.type-refused',
    ],
    [
      'an image over the limit',
      upload(
        Buffer.concat([png(10, 10), Buffer.alloc(MAX_MERCHANDISE_IMAGE_SIZE)]),
        'image/png',
        'big.png',
      ),
      413,
      'file.too-large',
    ],
  ])('refuse %s', async (_, file, status, code) => {
    const c = await convention()
    const made = item(await c.as('post', '/merchandise-items', mug))

    const res = await c.as('post', `/merchandise-items/${made.id}/pictures`, { file })

    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ code })
    expect(await storedRows('merchandise_item_pictures', c.t.id)).toEqual([])
  })

  it('are held up to ten an item', async () => {
    const c = await convention()
    const made = await addMerchandiseItem(c.t.id, c.edition, { pictures: MAX_ITEM_PICTURES })

    const res = await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture() })

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      code: 'catalog.limit-reached',
      params: { limit: MAX_ITEM_PICTURES },
    })
  })
})

describe('the size chart of a value', () => {
  it('is put, shown with its value, replaced and taken away, its file with it', async () => {
    const c = await convention()
    const made = await addShirt(c)
    const womens = valueOf(made, "Women's")
    const at = `/merchandise-items/${made.id}/option-values/${womens}/size-chart`
    const chartOf = (of: MerchandiseItem) => of.axes[0]!.values[0]!.sizeChart

    const first = chartOf(item(await c.as('put', at, { file: picture(500, 700) }).expect(200)))
    expect(first).toEqual({ fileId: expect.any(String) as string, width: 500, height: 700 })

    const second = chartOf(item(await c.as('put', at, { file: picture(600, 600) }).expect(200)))
    expect(second!.fileId).not.toBe(first!.fileId)
    expect(await storedFiles(c.t.id, 'merchandise-size-chart')).toMatchObject([
      { id: second!.fileId },
    ])
    expect(await objectKeys(fileKey('edition', c.t.id, first!.fileId))).toEqual([])

    await c.as('delete', at).expect(204)
    expect(chartOf(item(await c.as('patch', `/merchandise-items/${made.id}`, {})))).toBeNull()
    expect(await storedFiles(c.t.id, 'merchandise-size-chart')).toEqual([])
    await c.as('delete', at).expect(404)
  })

  it('is put for a value of the item the path names, and no other', async () => {
    const c = await convention()
    const [made, other] = [await addShirt(c), await addShirt(c)]

    for (const value of [valueOf(other, "Women's"), randomUUID(), 'no-uuid']) {
      await c
        .as('put', `/merchandise-items/${made.id}/option-values/${value}/size-chart`, {
          file: picture(),
        })
        .expect(404)
    }
    expect(await storedFiles(c.t.id, 'merchandise-size-chart')).toEqual([])
  })

  it('goes with its value', async () => {
    const c = await convention()
    const made = await addShirt(c)
    const cut = made.axes[0]!
    await c
      .as('put', `/merchandise-items/${made.id}/option-values/${cut.values[0]!.id}/size-chart`, {
        file: picture(),
      })
      .expect(200)
    const [chart] = await storedFiles(c.t.id, 'merchandise-size-chart')

    await c
      .as('patch', `/merchandise-items/${made.id}`, {
        axes: [
          { id: cut.id, name: cut.name, values: [{ id: cut.values[1]!.id, label: "Men's" }] },
          { id: made.axes[1]!.id, name: 'Size', values: [{ label: 'One size' }] },
        ],
      })
      .expect(200)

    expect(await storedFiles(c.t.id, 'merchandise-size-chart')).toEqual([])
    expect(await objectKeys(fileKey('edition', c.t.id, chart!.id))).toEqual([])
  })
})

describe("a picture as the edition's orgs read it", () => {
  /** An item with a picture and a size chart, hidden or shown. */
  async function withFiles(c: Convention, hidden = false) {
    const made = await addShirt(c)
    const withPicture = item(
      await c.as('post', `/merchandise-items/${made.id}/pictures`, { file: picture(1200, 900) }),
    )
    const withChart = item(
      await c.as(
        'put',
        `/merchandise-items/${made.id}/option-values/${valueOf(made, "Women's")}/size-chart`,
        { file: picture(400, 400) },
      ),
    )
    if (hidden) await c.as('patch', `/merchandise-items/${made.id}`, { hidden: true }).expect(200)
    return {
      id: made.id,
      shot: withPicture.pictures[0]!.fileId,
      chart: withChart.axes[0]!.values[0]!.sizeChart!.fileId,
    }
  }

  it('is served in both sizes, of a hidden item of an unpublished edition too', async () => {
    const c = await convention()
    const files = await withFiles(c, true)
    const reader = await member()
    await addEditionAccess(c.t.id, await addOrg(c.t.id, reader), c.edition, { tickets: 'read' })

    for (const [fileId, variant] of [
      [files.shot, 'small'],
      [files.shot, 'large'],
      [files.chart, 'large'],
    ]) {
      const res = await c.as('get', `/merchandise-files/${fileId}/${variant}`, undefined, reader)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/webp')
      expect(res.headers['cache-control']).toMatch(/no-store/)
    }
  })

  it('is no file of the edition when it is anything else', async () => {
    const c = await convention()
    const files = await withFiles(c)
    const other = await convention()
    const theirs = await withFiles(other)
    const terms = await addDocument(c.t.id, c.edition, 'shop-terms')

    for (const path of [
      `/merchandise-files/${files.shot}/original`,
      `/merchandise-files/${theirs.shot}/small`,
      `/merchandise-files/${terms.fileIds[0]}/small`,
      `/merchandise-files/${randomUUID()}/small`,
      '/merchandise-files/no-uuid/small',
    ]) {
      await c.as('get', path).expect(404)
    }
    // A file of another edition of the same convention is not this edition's either.
    const elsewhere = await addEdition(c.t.id)
    await call(
      c.t.head,
      'get',
      `/editions/${elsewhere}/merchandise-files/${files.shot}/small`,
      undefined,
      c.t.slug,
    ).expect(404)
  })

  describe('and as everyone does', () => {
    const publicly = (slug: string, fileId: string, variant = 'small') =>
      anyone().get(`/public/tenants/${slug}/merchandise-files/${fileId}/${variant}`)

    it('is served without a sign-in once its item is shown in a published edition', async () => {
      const c = await convention()
      const files = await withFiles(c)
      await setPublished(c.edition, true)

      for (const [fileId, variant] of [
        [files.shot, 'small'],
        [files.shot, 'large'],
        [files.chart, 'large'],
      ]) {
        const res = await publicly(c.t.slug, fileId!, variant)

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toBe('image/webp')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
      }
    })

    it('is unknown while its item is hidden or its edition is not published', async () => {
      const c = await convention()
      const hidden = await withFiles(c, true)
      const shown = await withFiles(c)

      // The edition is not published yet: nothing of it is for everyone.
      await publicly(c.t.slug, shown.shot).expect(404)

      await setPublished(c.edition, true)
      await publicly(c.t.slug, shown.shot).expect(200)
      await publicly(c.t.slug, hidden.shot).expect(404)
      await publicly(c.t.slug, hidden.chart, 'large').expect(404)

      // Shown again, its pictures are for everyone at once.
      await c.as('patch', `/merchandise-items/${hidden.id}`, { hidden: false }).expect(200)
      await publicly(c.t.slug, hidden.shot).expect(200)
    })

    it('is unknown under another convention, an unknown size and a suspended convention', async () => {
      const c = await convention()
      const files = await withFiles(c)
      await setPublished(c.edition, true)
      const terms = await addDocument(c.t.id, c.edition, 'shop-terms')

      await publicly(b.slug, files.shot).expect(404)
      await publicly(c.t.slug, files.shot, 'master').expect(404)
      await publicly(c.t.slug, terms.fileIds[0]!).expect(404)
      await publicly(c.t.slug, 'no-uuid').expect(404)
      await publicly(c.t.slug, files.shot).expect(200)

      await suspend(c.t.id)
      await publicly(c.t.slug, files.shot).expect(404)
    })
  })
})
