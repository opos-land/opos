import { describe, expect, it } from 'vitest'
import { createEdition, createTenant, inTenant, migrator } from './db'

// What a convention sets before an edition sells anything (docs/specs/0002-shop-setup.md): the
// seller's details and the provider account, one of each a tenant, and for each edition its shop,
// its legal documents with their versions, and its consents.

const SHA = 'd'.repeat(64)

const pdf = async (tenantId: string, editionId: string) => {
  const [row] = await migrator<{ id: string }[]>`
    insert into uploaded_files (tenant_id, edition_id, kind, content_type, size, sha256, name)
    values (${tenantId}, ${editionId}, 'edition-document', 'application/pdf', 10, ${SHA}, 'terms.pdf')
    returning id
  `
  return row!.id
}

const document = async (tenantId: string, editionId: string, kind = 'shop-terms') => {
  const [row] = await migrator<{ id: string }[]>`
    insert into edition_documents (tenant_id, edition_id, kind, title)
    values (${tenantId}, ${editionId}, ${kind}, 'Terms')
    returning id
  `
  return row!.id
}

const version = (
  tenantId: string,
  editionId: string,
  documentId: string,
  fileId: string,
  number = 1,
) =>
  migrator`
    insert into edition_document_versions (tenant_id, edition_id, document_id, number, file_id)
    values (${tenantId}, ${editionId}, ${documentId}, ${number}, ${fileId})
  `

const consent = (tenantId: string, editionId: string, documentId: string | null, position = 1) =>
  migrator`
    insert into edition_consents (tenant_id, edition_id, document_id, text, is_required, position)
    values (${tenantId}, ${editionId}, ${documentId}, 'I accept the terms.', true, ${position})
  `

async function tenantWithEdition() {
  const tenant = await createTenant()
  return { tenant, edition: await createEdition(tenant.id) }
}

describe('shop_sellers', () => {
  it('holds one row a tenant, in PLN unless told otherwise, and nothing else is told', async () => {
    const tenant = await createTenant()
    await migrator`insert into shop_sellers (tenant_id) values (${tenant.id})`

    const [row] = await migrator`select currency from shop_sellers where tenant_id = ${tenant.id}`
    expect(row).toEqual({ currency: 'PLN' })
    await expect(
      migrator`insert into shop_sellers (tenant_id) values (${tenant.id})`,
    ).rejects.toThrow(/shop_sellers_pkey/)
    await expect(
      migrator`update shop_sellers set currency = 'EUR' where tenant_id = ${tenant.id}`,
    ).rejects.toThrow(/shop_sellers_currency/)
  })

  it.each(['seller_name', 'seller_address', 'seller_registration_number', 'contact_email'])(
    'refuses a blank %s',
    async (column) => {
      const tenant = await createTenant()
      await migrator`insert into shop_sellers (tenant_id) values (${tenant.id})`

      await expect(
        migrator.unsafe(
          `update shop_sellers set ${column} = '  ' where tenant_id = '${tenant.id}'`,
        ),
      ).rejects.toThrow(/shop_sellers_not_blank/)
    },
  )

  it('goes with its tenant', async () => {
    const tenant = await createTenant()
    await migrator`insert into shop_sellers (tenant_id) values (${tenant.id})`

    await migrator`delete from tenants where id = ${tenant.id}`

    expect(await migrator`select 1 from shop_sellers where tenant_id = ${tenant.id}`).toHaveLength(
      0,
    )
  })
})

describe('payment_provider_accounts', () => {
  const account = (tenantId: string, provider = 'fake') =>
    migrator`
      insert into payment_provider_accounts (tenant_id, provider, credentials)
      values (${tenantId}, ${provider}, 'sealed')
    `

  it('holds one account a tenant, not ready until it is said to be', async () => {
    const tenant = await createTenant()
    await account(tenant.id)

    const [row] = await migrator`
      select ready_at from payment_provider_accounts where tenant_id = ${tenant.id}
    `
    expect(row).toEqual({ ready_at: null })
    await expect(account(tenant.id)).rejects.toThrow(/payment_provider_accounts_pkey/)
  })

  it('refuses a provider OPOS has no module of, and empty credentials', async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()])

    await expect(account(a.id, 'cash')).rejects.toThrow(/payment_provider_accounts_provider/)
    await expect(
      migrator`
        insert into payment_provider_accounts (tenant_id, provider, credentials)
        values (${b.id}, 'fake', '')
      `,
    ).rejects.toThrow(/payment_provider_accounts_credentials/)
  })
})

describe('edition_shops', () => {
  it('holds one row an edition, closed until it is opened', async () => {
    const { tenant, edition } = await tenantWithEdition()
    await migrator`insert into edition_shops (tenant_id, edition_id) values (${tenant.id}, ${edition})`

    const [row] = await migrator`
      select opened_at, faq_url from edition_shops where edition_id = ${edition}
    `
    expect(row).toEqual({ opened_at: null, faq_url: null })
    await expect(
      migrator`insert into edition_shops (tenant_id, edition_id) values (${tenant.id}, ${edition})`,
    ).rejects.toThrow(/edition_shops_pkey/)
  })

  it('refuses an edition of another tenant, and goes with its edition', async () => {
    const [a, b] = await Promise.all([tenantWithEdition(), tenantWithEdition()])

    await expect(
      migrator`insert into edition_shops (tenant_id, edition_id) values (${a.tenant.id}, ${b.edition})`,
    ).rejects.toThrow(/edition_shops_edition_fk/)

    await migrator`insert into edition_shops (tenant_id, edition_id) values (${a.tenant.id}, ${a.edition})`
    await inTenant(a.tenant.id, (sql) => sql`delete from editions where id = ${a.edition}`)
    expect(
      await migrator`select 1 from edition_shops where edition_id = ${a.edition}`,
    ).toHaveLength(0)
  })
})

describe('edition_documents and their versions', () => {
  it('refuses a kind of document the shop does not know', async () => {
    const { tenant, edition } = await tenantWithEdition()

    await expect(document(tenant.id, edition, 'manifesto')).rejects.toThrow(/edition_document_kind/)
  })

  it('refuses a document in an edition of another tenant', async () => {
    const [a, b] = await Promise.all([tenantWithEdition(), tenantWithEdition()])

    await expect(document(a.tenant.id, b.edition)).rejects.toThrow(/edition_documents_edition_fk/)
  })

  it('numbers the versions of a document, each number once', async () => {
    const { tenant, edition } = await tenantWithEdition()
    const terms = await document(tenant.id, edition)
    await version(tenant.id, edition, terms, await pdf(tenant.id, edition), 1)
    await version(tenant.id, edition, terms, await pdf(tenant.id, edition), 2)

    await expect(
      version(tenant.id, edition, terms, await pdf(tenant.id, edition), 2),
    ).rejects.toThrow(/edition_document_versions_document_number_unique/)
    await expect(
      version(tenant.id, edition, terms, await pdf(tenant.id, edition), 0),
    ).rejects.toThrow(/edition_document_versions_number/)
  })

  it('refuses a version of a document, and a file, of another tenant or another edition', async () => {
    const [a, b] = await Promise.all([tenantWithEdition(), tenantWithEdition()])
    const mine = await document(a.tenant.id, a.edition)
    const theirs = await document(b.tenant.id, b.edition)
    const otherEdition = await createEdition(a.tenant.id)
    const elsewhere = await document(a.tenant.id, otherEdition)

    await expect(
      version(a.tenant.id, a.edition, theirs, await pdf(a.tenant.id, a.edition)),
    ).rejects.toThrow(/edition_document_versions_document_fk/)
    await expect(
      version(a.tenant.id, a.edition, mine, await pdf(b.tenant.id, b.edition)),
    ).rejects.toThrow(/edition_document_versions_file_fk/)
    await expect(
      version(a.tenant.id, a.edition, elsewhere, await pdf(a.tenant.id, a.edition)),
    ).rejects.toThrow(/edition_document_versions_document_fk/)
    // A version's file is its own edition's: neither a file of another edition of the tenant, nor
    // one of the convention's own, such as its logo.
    await expect(
      version(a.tenant.id, a.edition, mine, await pdf(a.tenant.id, otherEdition)),
    ).rejects.toThrow(/edition_document_versions_file_fk/)
    const [logo] = await migrator<{ id: string }[]>`
      insert into uploaded_files (tenant_id, kind, content_type, size, sha256, name, width, height)
      values (${a.tenant.id}, 'convention-logo', 'image/png', 10, ${SHA}, 'logo.png', 10, 10)
      returning id
    `
    await expect(version(a.tenant.id, a.edition, mine, logo!.id)).rejects.toThrow(
      /edition_document_versions_file_fk/,
    )
  })

  it('keeps the file a version points at: the application role cannot delete it', async () => {
    const { tenant, edition } = await tenantWithEdition()
    const file = await pdf(tenant.id, edition)
    await version(tenant.id, edition, await document(tenant.id, edition), file)

    await expect(
      inTenant(tenant.id, (sql) => sql`delete from uploaded_files where id = ${file}`),
    ).rejects.toThrow(/edition_document_versions_file_fk/)
    const [kept] = await migrator`select id from uploaded_files where id = ${file}`
    expect(kept).toBeDefined()
  })

  it('takes the versions along with their document, and both with the edition', async () => {
    const { tenant, edition } = await tenantWithEdition()
    const terms = await document(tenant.id, edition)
    const other = await document(tenant.id, edition, 'privacy-policy')
    await version(tenant.id, edition, terms, await pdf(tenant.id, edition))
    await version(tenant.id, edition, other, await pdf(tenant.id, edition))
    const versions = () =>
      migrator`select 1 from edition_document_versions where edition_id = ${edition}`

    await inTenant(tenant.id, (sql) => sql`delete from edition_documents where id = ${terms}`)
    expect(await versions()).toHaveLength(1)

    await inTenant(tenant.id, (sql) => sql`delete from editions where id = ${edition}`)
    expect(await versions()).toHaveLength(0)
    expect(
      await migrator`select 1 from edition_documents where edition_id = ${edition}`,
    ).toHaveLength(0)
  })
})

describe('edition_consents', () => {
  it('links a document of its own edition, or none', async () => {
    const [a, b] = await Promise.all([tenantWithEdition(), tenantWithEdition()])
    const mine = await document(a.tenant.id, a.edition)
    const theirs = await document(b.tenant.id, b.edition)
    const elsewhere = await document(a.tenant.id, await createEdition(a.tenant.id))

    await consent(a.tenant.id, a.edition, mine, 1)
    await consent(a.tenant.id, a.edition, null, 2)
    await expect(consent(a.tenant.id, a.edition, theirs, 3)).rejects.toThrow(
      /edition_consents_document_fk/,
    )
    await expect(consent(a.tenant.id, a.edition, elsewhere, 3)).rejects.toThrow(
      /edition_consents_document_fk/,
    )
  })

  it('links its document for good: the application role aims it at no other', async () => {
    const { tenant, edition } = await tenantWithEdition()
    const terms = await document(tenant.id, edition)
    const privacy = await document(tenant.id, edition, 'privacy-policy')
    await consent(tenant.id, edition, terms)

    for (const target of [privacy, null]) {
      await expect(
        inTenant(
          tenant.id,
          (sql) =>
            sql`update edition_consents set document_id = ${target} where edition_id = ${edition}`,
        ),
      ).rejects.toThrow(/permission denied/)
    }
    // Its sentence, its place and whether it is required or hidden still change.
    await inTenant(
      tenant.id,
      (sql) => sql`
        update edition_consents set text = 'I accept.', is_required = false, position = 2,
          hidden_at = now()
        where edition_id = ${edition}
      `,
    )
  })

  it('keeps a document a consent links: the consent lets go of it first', async () => {
    const { tenant, edition } = await tenantWithEdition()
    const terms = await document(tenant.id, edition)
    await consent(tenant.id, edition, terms)

    await expect(
      inTenant(tenant.id, (sql) => sql`delete from edition_documents where id = ${terms}`),
    ).rejects.toThrow(/edition_consents_document_fk/)
  })

  it('refuses an empty sentence and a place below the first', async () => {
    const { tenant, edition } = await tenantWithEdition()

    await expect(
      migrator`
        insert into edition_consents (tenant_id, edition_id, text, is_required, position)
        values (${tenant.id}, ${edition}, '  ', true, 1)
      `,
    ).rejects.toThrow(/edition_consents_text/)
    await expect(consent(tenant.id, edition, null, 0)).rejects.toThrow(/edition_consents_position/)
  })
})
