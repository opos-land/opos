import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, global, inTenant, migrator } from './db'

// What an edition sells (docs/specs/0003-catalog.md): ticket types with their price tiers,
// supporter prices and perks, add-ons, merchandise items with their axes, variants, pictures and
// size charts, and the edition's custom fields. Every row is its tenant's and its edition's, and
// points only at rows of the same two.

const SHA = 'c'.repeat(64)

interface Place {
  tenant: string
  edition: string
}

async function place(): Promise<Place> {
  const tenant = await createTenant()
  return { tenant: tenant.id, edition: await createEdition(tenant.id) }
}

/** Another edition of the same tenant: a row of it is as foreign as another tenant's. */
const sibling = async (at: Place): Promise<Place> => ({
  tenant: at.tenant,
  edition: await createEdition(at.tenant),
})

const one = async (query: Promise<{ id: string }[]>) => (await query)[0]!.id

const ticketType = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    name: 'Standard',
    sale_starts_at: '2026-01-01T00:00:00Z',
    sale_ends_at: '2026-06-01T00:00:00Z',
    allows_child: true,
    allows_teen: true,
    allows_adult: true,
    position: 1,
    ...values,
  }
  return one(migrator`insert into ticket_types ${migrator(row)} returning id`)
}

const tier = (at: Place, ticketTypeId: string, from: string, to: string, amount = 10000) =>
  migrator`
    insert into ticket_type_price_tiers
      (tenant_id, edition_id, ticket_type_id, amount_minor, starts_at, ends_at)
    values (${at.tenant}, ${at.edition}, ${ticketTypeId}, ${amount}, ${from}, ${to})
  `

const addOn = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    name: 'Sleeping room',
    amount_minor: 0,
    kind: 'unlimited',
    position: 1,
    ...values,
  }
  return one(migrator`insert into add_ons ${migrator(row)} returning id`)
}

const item = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    name: 'T-shirt',
    amount_minor: 8000,
    per_order_limit: 5,
    position: 1,
    ...values,
  }
  return one(migrator`insert into merchandise_items ${migrator(row)} returning id`)
}

const axis = (at: Place, itemId: string, name = 'Size', position = 1) =>
  one(migrator`
    insert into merchandise_option_axes (tenant_id, edition_id, merchandise_item_id, name, position)
    values (${at.tenant}, ${at.edition}, ${itemId}, ${name}, ${position})
    returning id
  `)

const value = (at: Place, itemId: string, axisId: string, label = 'M', position = 1) =>
  one(migrator`
    insert into merchandise_option_values
      (tenant_id, edition_id, merchandise_item_id, axis_id, label, position)
    values (${at.tenant}, ${at.edition}, ${itemId}, ${axisId}, ${label}, ${position})
    returning id
  `)

const variant = (at: Place, itemId: string, stock: number | null = null) =>
  one(migrator`
    insert into merchandise_variants (tenant_id, edition_id, merchandise_item_id, stock)
    values (${at.tenant}, ${at.edition}, ${itemId}, ${stock})
    returning id
  `)

const variantValue = (
  at: Place,
  itemId: string,
  variantId: string,
  axisId: string,
  valueId: string,
) =>
  migrator`
    insert into merchandise_variant_values
      (tenant_id, edition_id, merchandise_item_id, variant_id, axis_id, option_value_id)
    values (${at.tenant}, ${at.edition}, ${itemId}, ${variantId}, ${axisId}, ${valueId})
  `

const image = (at: Place, kind = 'merchandise-picture') =>
  one(migrator`
    insert into uploaded_files
      (tenant_id, edition_id, kind, content_type, size, sha256, name, width, height)
    values (${at.tenant}, ${at.edition}, ${kind}, 'image/png', 10, ${SHA}, 'p.png', 10, 10)
    returning id
  `)

const picture = (at: Place, itemId: string, fileId: string, position = 1) =>
  migrator`
    insert into merchandise_item_pictures
      (tenant_id, edition_id, merchandise_item_id, file_id, position)
    values (${at.tenant}, ${at.edition}, ${itemId}, ${fileId}, ${position})
  `

const sizeChart = (at: Place, valueId: string, fileId: string) =>
  migrator`
    insert into merchandise_size_charts (tenant_id, edition_id, option_value_id, file_id)
    values (${at.tenant}, ${at.edition}, ${valueId}, ${fileId})
  `

const addOnPicture = (at: Place, addOnId: string, fileId: string) =>
  migrator`
    insert into add_on_pictures (tenant_id, edition_id, add_on_id, file_id)
    values (${at.tenant}, ${at.edition}, ${addOnId}, ${fileId})
  `

const customField = (at: Place, values: Record<string, unknown> = {}) => {
  const row = {
    tenant_id: at.tenant,
    edition_id: at.edition,
    label: 'Fandom',
    is_required: false,
    position: 1,
    ...values,
  }
  return one(migrator`insert into edition_custom_fields ${migrator(row)} returning id`)
}

describe('ticket_types', () => {
  it('belongs to an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await expect(ticketType({ tenant: a.tenant, edition: b.edition })).rejects.toThrow(
      /ticket_types_edition_fk/,
    )
  })

  it.each([
    ['a blank name', { name: '  ' }, /ticket_types_name/],
    ['a name over 100 characters', { name: 'n'.repeat(101) }, /ticket_types_name/],
    ['a short description over 300', { short_description: 's'.repeat(301) }, /short_description/],
    ['a long description over 5000', { long_description: 'l'.repeat(5001) }, /long_description/],
    ['a capacity below zero', { capacity: -1 }, /ticket_types_capacity/],
    [
      'a sale window that ends before it starts',
      { sale_starts_at: '2026-06-01T00:00:00Z', sale_ends_at: '2026-06-01T00:00:00Z' },
      /ticket_types_sale_window/,
    ],
    [
      'no age band allowed',
      { allows_child: false, allows_teen: false, allows_adult: false },
      /ticket_types_age_bands/,
    ],
    ['a place below the first', { position: 0 }, /ticket_types_position/],
  ])('refuses %s', async (_, values, constraint) => {
    await expect(ticketType(await place(), values)).rejects.toThrow(constraint)
  })

  it('has no limit without a capacity, takes discounts and hides outside its window unless told', async () => {
    const at = await place()
    const id = await ticketType(at)

    const [row] = await migrator`
      select capacity, discounts_excluded, shown_outside_sale_window, short_description,
        long_description, hidden_at
      from ticket_types where id = ${id}
    `
    expect(row).toEqual({
      capacity: null,
      discounts_excluded: false,
      shown_outside_sale_window: false,
      short_description: '',
      long_description: '',
      hidden_at: null,
    })
  })
})

describe('ticket_type_price_tiers', () => {
  it('keeps the windows of one ticket type apart, and lets them touch', async () => {
    const at = await place()
    const standard = await ticketType(at)
    await tier(at, standard, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')

    // A window ends where the next one starts: the moment itself belongs to the later one.
    await tier(at, standard, '2026-03-01T00:00:00Z', '2026-05-01T00:00:00Z')
    await expect(
      tier(at, standard, '2026-02-28T23:59:59Z', '2026-03-02T00:00:00Z'),
    ).rejects.toThrow(/ticket_type_price_tiers_no_overlap/)
    await expect(
      tier(at, standard, '2025-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
    ).rejects.toThrow(/ticket_type_price_tiers_no_overlap/)
  })

  it('lets the windows of two ticket types overlap', async () => {
    const at = await place()
    const [standard, supporter] = [await ticketType(at), await ticketType(at, { position: 2 })]

    await tier(at, standard, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')
    await tier(at, supporter, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')
  })

  it('refuses a ticket type of another tenant or another edition', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)

    for (const foreign of [await ticketType(b), await ticketType(elsewhere)]) {
      await expect(
        tier(a, foreign, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'),
      ).rejects.toThrow(/ticket_type_price_tiers_ticket_type_fk/)
    }
  })

  it('refuses an amount below zero and a window that ends before it starts', async () => {
    const at = await place()
    const standard = await ticketType(at)

    await expect(
      tier(at, standard, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', -1),
    ).rejects.toThrow(/ticket_type_price_tiers_amount/)
    await expect(
      tier(at, standard, '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z'),
    ).rejects.toThrow(/ticket_type_price_tiers_window/)
  })
})

describe('ticket_type_supporter_prices and ticket_type_perks', () => {
  const supporterPrice = (at: Place, ticketTypeId: string, amount: number) =>
    migrator`
      insert into ticket_type_supporter_prices (tenant_id, edition_id, ticket_type_id, amount_minor)
      values (${at.tenant}, ${at.edition}, ${ticketTypeId}, ${amount})
    `
  const perk = (at: Place, ticketTypeId: string, name = 'A pin', position = 1) =>
    migrator`
      insert into ticket_type_perks (tenant_id, edition_id, ticket_type_id, name, position)
      values (${at.tenant}, ${at.edition}, ${ticketTypeId}, ${name}, ${position})
    `

  it('offers each supporter price of a ticket type once, above zero', async () => {
    const at = await place()
    const standard = await ticketType(at)
    await supporterPrice(at, standard, 20000)

    await expect(supporterPrice(at, standard, 20000)).rejects.toThrow(
      /ticket_type_supporter_prices_amount_unique/,
    )
    await expect(supporterPrice(at, standard, 0)).rejects.toThrow(
      /ticket_type_supporter_prices_amount/,
    )
  })

  it('refuses a ticket type of another tenant or another edition', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)

    for (const foreign of [await ticketType(b), await ticketType(elsewhere)]) {
      await expect(supporterPrice(a, foreign, 20000)).rejects.toThrow(
        /ticket_type_supporter_prices_ticket_type_fk/,
      )
      await expect(perk(a, foreign)).rejects.toThrow(/ticket_type_perks_ticket_type_fk/)
    }
  })

  it('refuses a perk with no name and a place below the first', async () => {
    const at = await place()
    const standard = await ticketType(at)

    await expect(perk(at, standard, ' ')).rejects.toThrow(/ticket_type_perks_name/)
    await expect(perk(at, standard, 'A pin', 0)).rejects.toThrow(/ticket_type_perks_position/)
  })
})

describe('add_ons', () => {
  it.each([
    ['a limited one without a capacity', { kind: 'limited' }, /add_ons_capacity/],
    ['an unlimited one with a capacity', { capacity: 10 }, /add_ons_capacity/],
    ['a headcount with a capacity', { kind: 'headcount', capacity: 10 }, /add_ons_capacity/],
    ['a capacity below zero', { kind: 'limited', capacity: -1 }, /add_ons_capacity/],
    ['a threshold on an unlimited one', { places_left_threshold: 5 }, /add_ons_threshold/],
    [
      'a threshold below one',
      { kind: 'limited', capacity: 10, places_left_threshold: 0 },
      /add_ons_threshold/,
    ],
    ['a price below zero', { amount_minor: -1 }, /add_ons_amount/],
    ['a blank name', { name: ' ' }, /add_ons_name/],
    ['a kind OPOS does not know', { kind: 'waitlist' }, /add_on_kind/],
  ])('refuses %s', async (_, values, constraint) => {
    await expect(addOn(await place(), values)).rejects.toThrow(constraint)
  })

  it('takes a free one, and a limited one with its threshold', async () => {
    const at = await place()

    await addOn(at)
    await addOn(at, { kind: 'limited', capacity: 40, places_left_threshold: 5, position: 2 })
    await addOn(at, { kind: 'headcount', position: 3 })
  })

  it('belongs to an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await expect(addOn({ tenant: a.tenant, edition: b.edition })).rejects.toThrow(
      /add_ons_edition_fk/,
    )
  })
})

describe('what a ticket type offers', () => {
  const offerAddOn = (at: Place, ticketTypeId: string, addOnId: string) =>
    migrator`
      insert into ticket_type_add_ons (tenant_id, edition_id, ticket_type_id, add_on_id)
      values (${at.tenant}, ${at.edition}, ${ticketTypeId}, ${addOnId})
    `
  const offerItem = (at: Place, ticketTypeId: string, itemId: string) =>
    migrator`
      insert into ticket_type_merchandise_items
        (tenant_id, edition_id, ticket_type_id, merchandise_item_id)
      values (${at.tenant}, ${at.edition}, ${ticketTypeId}, ${itemId})
    `

  it('is an add-on and an item of its own edition, each once', async () => {
    const at = await place()
    const [standard, room, shirt] = [await ticketType(at), await addOn(at), await item(at)]
    await offerAddOn(at, standard, room)
    await offerItem(at, standard, shirt)

    await expect(offerAddOn(at, standard, room)).rejects.toThrow(/ticket_type_add_ons_pkey/)
    await expect(offerItem(at, standard, shirt)).rejects.toThrow(
      /ticket_type_merchandise_items_pkey/,
    )
  })

  it('is never an add-on or an item of another tenant or another edition', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)
    const standard = await ticketType(a)

    for (const foreign of [b, elsewhere]) {
      await expect(offerAddOn(a, standard, await addOn(foreign))).rejects.toThrow(
        /ticket_type_add_ons_add_on_fk/,
      )
      await expect(offerItem(a, standard, await item(foreign))).rejects.toThrow(
        /ticket_type_merchandise_items_item_fk/,
      )
      const theirs = await ticketType(foreign)
      await expect(offerAddOn(a, theirs, await addOn(a))).rejects.toThrow(
        /ticket_type_add_ons_ticket_type_fk/,
      )
      await expect(offerItem(a, theirs, await item(a))).rejects.toThrow(
        /ticket_type_merchandise_items_ticket_type_fk/,
      )
    }
  })

  it('goes with either side', async () => {
    const at = await place()
    const [standard, room, shirt] = [await ticketType(at), await addOn(at), await item(at)]
    await offerAddOn(at, standard, room)
    await offerItem(at, standard, shirt)

    await inTenant(at.tenant, (sql) => sql`delete from add_ons where id = ${room}`)
    await inTenant(at.tenant, (sql) => sql`delete from merchandise_items where id = ${shirt}`)

    expect(
      await migrator`select 1 from ticket_type_add_ons where ticket_type_id = ${standard}`,
    ).toHaveLength(0)
    expect(
      await migrator`
        select 1 from ticket_type_merchandise_items where ticket_type_id = ${standard}
      `,
    ).toHaveLength(0)
    expect(await migrator`select 1 from ticket_types where id = ${standard}`).toHaveLength(1)
  })
})

describe('merchandise_items', () => {
  it.each([
    ['a blank name', { name: ' ' }, /merchandise_items_name/],
    ['a price below zero', { amount_minor: -1 }, /merchandise_items_amount/],
    ['a limit an order below one', { per_order_limit: 0 }, /merchandise_items_per_order_limit/],
    ['a limit an order over 100', { per_order_limit: 101 }, /merchandise_items_per_order_limit/],
    ['a place below the first', { position: 0 }, /merchandise_items_position/],
  ])('refuses %s', async (_, values, constraint) => {
    await expect(item(await place(), values)).rejects.toThrow(constraint)
  })

  it('belongs to an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await expect(item({ tenant: a.tenant, edition: b.edition })).rejects.toThrow(
      /merchandise_items_edition_fk/,
    )
  })
})

describe('the axes, values and variants of an item', () => {
  it('holds an axis, a value and a variant inside their item, tenant and edition', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)
    const shirt = await item(a)
    const size = await axis(a, shirt)

    for (const foreign of [b, elsewhere]) {
      const theirs = await item(foreign)
      await expect(axis(a, theirs)).rejects.toThrow(/merchandise_option_axes_item_fk/)
      await expect(variant(a, theirs)).rejects.toThrow(/merchandise_variants_item_fk/)
      await expect(value(a, theirs, await axis(foreign, theirs))).rejects.toThrow(
        /merchandise_option_values_axis_fk/,
      )
    }
    // A value names the item of its axis: an axis of another item of the edition is not its own.
    const mug = await item(a, { position: 2 })
    await expect(value(a, mug, size)).rejects.toThrow(/merchandise_option_values_axis_fk/)
  })

  it('gives a variant one value of an axis of its own item', async () => {
    const at = await place()
    const shirt = await item(at)
    const size = await axis(at, shirt)
    const [medium, large] = [await value(at, shirt, size), await value(at, shirt, size, 'L', 2)]
    const mediumShirt = await variant(at, shirt)
    await variantValue(at, shirt, mediumShirt, size, medium)

    // A second value of the same axis.
    await expect(variantValue(at, shirt, mediumShirt, size, large)).rejects.toThrow(
      /merchandise_variant_values_pkey/,
    )

    const mug = await item(at, { position: 2 })
    const colour = await axis(at, mug, 'Colour')
    const red = await value(at, mug, colour, 'Red')
    // A value of another item, under its own item's name and under the variant's.
    await expect(variantValue(at, mug, mediumShirt, colour, red)).rejects.toThrow(
      /merchandise_variant_values_variant_fk/,
    )
    await expect(variantValue(at, shirt, mediumShirt, colour, red)).rejects.toThrow(
      /merchandise_variant_values_value_fk/,
    )
    // A value filed under an axis it is not of.
    const cut = await axis(at, shirt, 'Cut', 2)
    await expect(variantValue(at, shirt, mediumShirt, cut, medium)).rejects.toThrow(
      /merchandise_variant_values_value_fk/,
    )
  })

  it('refuses a stock below zero, and holds none while unlimited', async () => {
    const at = await place()
    const shirt = await item(at)

    await expect(variant(at, shirt, -1)).rejects.toThrow(/merchandise_variants_stock/)
    const unlimited = await variant(at, shirt)
    const [row] = await migrator`
      select stock, hidden_at from merchandise_variants where id = ${unlimited}
    `
    expect(row).toEqual({ stock: null, hidden_at: null })
  })

  it('refuses a blank axis and a blank value', async () => {
    const at = await place()
    const shirt = await item(at)

    await expect(axis(at, shirt, ' ')).rejects.toThrow(/merchandise_option_axes_name/)
    await expect(value(at, shirt, await axis(at, shirt), ' ')).rejects.toThrow(
      /merchandise_option_values_label/,
    )
  })

  it('takes the values of a variant along with the value, and everything with the item', async () => {
    const at = await place()
    const shirt = await item(at)
    const size = await axis(at, shirt)
    const medium = await value(at, shirt, size)
    const mediumShirt = await variant(at, shirt)
    await variantValue(at, shirt, mediumShirt, size, medium)
    const left = (table: string) =>
      migrator.unsafe(`select 1 from ${table} where merchandise_item_id = '${shirt}'`)

    await inTenant(
      at.tenant,
      (sql) => sql`delete from merchandise_option_values where id = ${medium}`,
    )
    expect(await left('merchandise_variant_values')).toHaveLength(0)
    expect(await left('merchandise_variants')).toHaveLength(1)

    await inTenant(at.tenant, (sql) => sql`delete from merchandise_items where id = ${shirt}`)
    expect(await left('merchandise_variants')).toHaveLength(0)
    expect(await left('merchandise_option_axes')).toHaveLength(0)
  })
})

describe('the pictures and size charts of an item', () => {
  it('points at a file of its own edition, each file once', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)
    const shirt = await item(a)
    const medium = await value(a, shirt, await axis(a, shirt))
    const mine = await image(a)
    await picture(a, shirt, mine)

    await expect(picture(a, shirt, mine, 2)).rejects.toThrow(
      /merchandise_item_pictures_file_unique/,
    )
    for (const foreign of [b, elsewhere]) {
      await expect(picture(a, shirt, await image(foreign), 2)).rejects.toThrow(
        /merchandise_item_pictures_file_fk/,
      )
      await expect(
        sizeChart(a, medium, await image(foreign, 'merchandise-size-chart')),
      ).rejects.toThrow(/merchandise_size_charts_file_fk/)
      const theirs = await item(foreign)
      await expect(picture(a, theirs, await image(a), 2)).rejects.toThrow(
        /merchandise_item_pictures_item_fk/,
      )
      await expect(
        sizeChart(
          a,
          await value(foreign, theirs, await axis(foreign, theirs)),
          await image(a, 'merchandise-size-chart'),
        ),
      ).rejects.toThrow(/merchandise_size_charts_value_fk/)
    }
  })

  it('holds one size chart a value', async () => {
    const at = await place()
    const shirt = await item(at)
    const medium = await value(at, shirt, await axis(at, shirt))
    await sizeChart(at, medium, await image(at, 'merchandise-size-chart'))

    await expect(sizeChart(at, medium, await image(at, 'merchandise-size-chart'))).rejects.toThrow(
      /merchandise_size_charts_pkey/,
    )
  })

  it('keeps the file a picture or a size chart points at', async () => {
    const at = await place()
    const shirt = await item(at)
    const medium = await value(at, shirt, await axis(at, shirt))
    const [shot, chart] = [await image(at), await image(at, 'merchandise-size-chart')]
    await picture(at, shirt, shot)
    await sizeChart(at, medium, chart)

    await expect(
      inTenant(at.tenant, (sql) => sql`delete from uploaded_files where id = ${shot}`),
    ).rejects.toThrow(/merchandise_item_pictures_file_fk/)
    await expect(
      inTenant(at.tenant, (sql) => sql`delete from uploaded_files where id = ${chart}`),
    ).rejects.toThrow(/merchandise_size_charts_file_fk/)
  })

  it('goes with the edition, its files with it', async () => {
    const at = await place()
    const shirt = await item(at)
    const medium = await value(at, shirt, await axis(at, shirt))
    await picture(at, shirt, await image(at))
    await sizeChart(at, medium, await image(at, 'merchandise-size-chart'))

    await inTenant(at.tenant, (sql) => sql`delete from editions where id = ${at.edition}`)

    for (const table of [
      'merchandise_item_pictures',
      'merchandise_size_charts',
      'uploaded_files',
    ]) {
      expect(
        await migrator.unsafe(`select 1 from ${table} where edition_id = '${at.edition}'`),
      ).toHaveLength(0)
    }
  })
})

// docs/specs/0003-catalog.md, A9: an add-on may have one picture, an uploaded image.
describe('the picture of an add-on', () => {
  const shot = (at: Place) => image(at, 'add-on-picture')

  it('points at a file of its own edition, a file once, and an add-on has one', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const elsewhere = await sibling(a)
    const [room, workshop] = [await addOn(a), await addOn(a)]
    const mine = await shot(a)
    await addOnPicture(a, room, mine)

    await expect(addOnPicture(a, room, await shot(a))).rejects.toThrow(/add_on_pictures_pkey/)
    await expect(addOnPicture(a, workshop, mine)).rejects.toThrow(/add_on_pictures_file_unique/)
    for (const foreign of [b, elsewhere]) {
      await expect(addOnPicture(a, workshop, await shot(foreign))).rejects.toThrow(
        /add_on_pictures_file_fk/,
      )
      await expect(addOnPicture(a, await addOn(foreign), await shot(a))).rejects.toThrow(
        /add_on_pictures_add_on_fk/,
      )
    }
  })

  it('keeps the file it points at, and goes with its add-on', async () => {
    const at = await place()
    const room = await addOn(at)
    const file = await shot(at)
    await addOnPicture(at, room, file)

    await expect(
      inTenant(at.tenant, (sql) => sql`delete from uploaded_files where id = ${file}`),
    ).rejects.toThrow(/add_on_pictures_file_fk/)
    await inTenant(at.tenant, (sql) => sql`delete from add_ons where id = ${room}`)

    expect(await migrator`select 1 from add_on_pictures where add_on_id = ${room}`).toHaveLength(0)
    // The file is released by the API, which deletes its row once nothing points at it.
    await inTenant(at.tenant, (sql) => sql`delete from uploaded_files where id = ${file}`)
  })

  it('goes with the edition, its file with it', async () => {
    const at = await place()
    await addOnPicture(at, await addOn(at), await shot(at))

    await inTenant(at.tenant, (sql) => sql`delete from editions where id = ${at.edition}`)

    for (const table of ['add_on_pictures', 'uploaded_files']) {
      expect(
        await migrator.unsafe(`select 1 from ${table} where edition_id = '${at.edition}'`),
      ).toHaveLength(0)
    }
  })

  it('is put and taken away by the application role, which changes none in place', async () => {
    const at = await place()
    const room = await addOn(at)
    const file = await shot(at)

    await inTenant(
      at.tenant,
      (sql) => sql`
        insert into add_on_pictures (tenant_id, edition_id, add_on_id, file_id)
        values (${at.tenant}, ${at.edition}, ${room}, ${file})
      `,
    )
    await expect(
      inTenant(at.tenant, (sql) => sql`update add_on_pictures set file_id = file_id`),
    ).rejects.toThrow(/permission denied/)
    await inTenant(at.tenant, (sql) => sql`delete from add_on_pictures where add_on_id = ${room}`)
  })

  it('is read by its own tenant alone, and across tenants by the file it points at alone', async () => {
    const [a, b] = await Promise.all([place(), place()])
    const file = await shot(b)
    await addOnPicture(b, await addOn(b), file)

    expect(await inTenant(a.tenant, (sql) => sql`select 1 from add_on_pictures`)).toHaveLength(0)
    // The sweep tells a picture's file from one nothing points at, and reads nothing else of it.
    expect(await global`select file_id from add_on_pictures where file_id = ${file}`).toEqual([
      { file_id: file },
    ])
    await expect(global`select add_on_id from add_on_pictures`).rejects.toThrow(/permission denied/)
  })
})

describe('edition_custom_fields', () => {
  it.each([
    ['a blank label', { label: ' ' }, /edition_custom_fields_label/],
    ['a label over 100 characters', { label: 'l'.repeat(101) }, /edition_custom_fields_label/],
    ['a place below the first', { position: 0 }, /edition_custom_fields_position/],
  ])('refuses %s', async (_, values, constraint) => {
    await expect(customField(await place(), values)).rejects.toThrow(constraint)
  })

  it('belongs to an edition of its own tenant', async () => {
    const [a, b] = await Promise.all([place(), place()])

    await expect(customField({ tenant: a.tenant, edition: b.edition })).rejects.toThrow(
      /edition_custom_fields_edition_fk/,
    )
  })
})

describe("the catalog's settings of edition_shops", () => {
  const shop = (at: Place, values: Record<string, unknown> = {}) =>
    migrator`
      insert into edition_shops ${migrator({ tenant_id: at.tenant, edition_id: at.edition, ...values })}
    `

  it('starts with no age bands, no deadline, no message and merch-only orders off', async () => {
    const at = await place()
    await shop(at)

    const [row] = await migrator`
      select teen_from_age, adult_from_age, guardian_consent_form_url, merch_preorder_deadline,
        merch_only_enabled, sales_closed_message
      from edition_shops where edition_id = ${at.edition}
    `
    expect(row).toEqual({
      teen_from_age: null,
      adult_from_age: null,
      guardian_consent_form_url: null,
      merch_preorder_deadline: null,
      merch_only_enabled: false,
      sales_closed_message: null,
    })
  })

  it.each([
    ['one age without the other', { teen_from_age: 13 }],
    ['the other age without the one', { adult_from_age: 18 }],
    ['an adult no older than a teen', { teen_from_age: 16, adult_from_age: 16 }],
    ['a teen from birth', { teen_from_age: 0, adult_from_age: 18 }],
    ['an adult past any age', { teen_from_age: 13, adult_from_age: 151 }],
  ])('refuses %s', async (_, values) => {
    await expect(shop(await place(), values)).rejects.toThrow(/edition_shops_age_bands/)
  })

  it('takes two ages, the second above the first, and refuses a message over 1000 characters', async () => {
    await shop(await place(), { teen_from_age: 13, adult_from_age: 18 })

    await expect(shop(await place(), { sales_closed_message: 'm'.repeat(1001) })).rejects.toThrow(
      /edition_shops_sales_closed_message/,
    )
  })
})

describe('what the application role changes of the catalog', () => {
  it('takes no value away from a variant: it goes with the variant or with the value', async () => {
    const at = await place()
    const shirt = await item(at)
    const size = await axis(at, shirt)
    const medium = await value(at, shirt, size)
    const mediumShirt = await variant(at, shirt)
    await variantValue(at, shirt, mediumShirt, size, medium)

    await expect(
      inTenant(at.tenant, (sql) => sql`delete from merchandise_variant_values`),
    ).rejects.toThrow(/permission denied/)

    await inTenant(
      at.tenant,
      (sql) => sql`delete from merchandise_variants where id = ${mediumShirt}`,
    )
    expect(
      await migrator`select 1 from merchandise_variant_values where variant_id = ${mediumShirt}`,
    ).toHaveLength(0)
  })

  it.each([
    ['merchandise_option_axes', "name = 'Fit'"],
    ['merchandise_option_values', "label = 'Medium'"],
    ['merchandise_item_pictures', 'position = 2'],
  ])('records when a row of %s last changed', async (table, change) => {
    const at = await place()
    const shirt = await item(at)
    await value(at, shirt, await axis(at, shirt))
    await picture(at, shirt, await image(at))
    await migrator.unsafe(
      `update ${table} set updated_at = '2020-01-01', created_at = '2020-01-01'
       where tenant_id = '${at.tenant}'`,
    )

    await inTenant(at.tenant, (sql) => sql.unsafe(`update ${table} set ${change}`))

    const [row] = await migrator.unsafe<{ created: Date; updated: Date }[]>(
      `select created_at as created, updated_at as updated from ${table}
       where tenant_id = '${at.tenant}'`,
    )
    expect(row!.created).toEqual(new Date('2020-01-01'))
    expect(row!.updated.getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('moves no row of the catalog to another parent', async () => {
    const at = await place()
    const [standard, other] = [await ticketType(at), await ticketType(at, { position: 2 })]
    await tier(at, standard, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')
    const shirt = await item(at)
    const size = await axis(at, shirt)
    const medium = await value(at, shirt, size)
    const mediumShirt = await variant(at, shirt)
    const [shot, another] = [await image(at), await image(at)]
    await picture(at, shirt, shot)

    for (const statement of [
      `update ticket_type_price_tiers set ticket_type_id = '${other}'`,
      `update ticket_type_price_tiers set amount_minor = 1`,
      `update merchandise_option_axes set merchandise_item_id = '${shirt}' where id = '${size}'`,
      `update merchandise_option_values set axis_id = '${size}' where id = '${medium}'`,
      `update merchandise_variants set merchandise_item_id = '${shirt}' where id = '${mediumShirt}'`,
      `update merchandise_item_pictures set file_id = '${another}'`,
      `update ticket_types set edition_id = '${at.edition}' where id = '${standard}'`,
    ]) {
      await expect(inTenant(at.tenant, (sql) => sql.unsafe(statement))).rejects.toThrow(
        /permission denied/,
      )
    }
    // What a screen changes still changes.
    await inTenant(at.tenant, async (sql) => {
      await sql`update ticket_types set name = 'Regular', capacity = 5, hidden_at = now()`
      await sql`update merchandise_variants set stock = 3, hidden_at = now()`
      await sql`update merchandise_item_pictures set position = 2`
      await sql`update merchandise_option_values set label = 'Medium', position = 2`
    })
  })
})
