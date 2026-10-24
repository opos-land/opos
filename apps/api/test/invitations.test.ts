import { randomUUID } from 'node:crypto'
import { type NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env'
import { ROUTE_RATE_LIMITS } from '../src/common/rate-limit/route-rate-limit'
import {
  type InvitationClaims,
  invitationKey,
  INVITATION_TTL_SECONDS,
  signInvitation,
} from '../src/modules/tenants/invitation-token'
import { createApp } from './app'
import { createAccount, deleteCreatedAccounts, mintToken, signIn, testEmail } from './auth'
import { deleteMail, invitationLinkIn, waitForMail } from './mailpit'
import {
  addEdition,
  addEditionAccess,
  addOrg,
  closeTenantDb,
  deleteCreatedTenants,
  deleteEdition,
  holdOpen,
  member,
  type Member,
  removeMembership,
  sleep,
  storedMembership,
  tenantWithHead,
} from './tenants'

// Organizer invitations (PLAN.md 7.7) against Supabase Auth, Postgres and Mailpit.

const env = loadEnv()
const key = invitationKey(env.INVITE_SECRET)
const addresses: string[] = []
let app: NestExpressApplication
let a: Awaited<ReturnType<typeof tenantWithHead>>
let b: Awaited<ReturnType<typeof tenantWithHead>>
let editionA: string
let editionB: string
// The membership of a's head, which the tokens a test signs itself name as their sender.
let aHeadMembership: string

beforeAll(async () => {
  app = await createApp()
  await app.listen(0, '127.0.0.1')
  ;[a, b] = await Promise.all([tenantWithHead(), tenantWithHead()])
  ;[editionA, editionB] = await Promise.all([addEdition(a.id), addEdition(b.id)])
  aHeadMembership = (await storedMembership(a.id, a.head.id))!.id
})

afterAll(async () => {
  await deleteCreatedTenants()
  await deleteCreatedAccounts()
  await Promise.all(addresses.map(deleteMail))
  await closeTenantDb()
  await app.close()
})

/** An address no account uses; its mail is removed after the file. */
const newAddress = () => {
  const address = testEmail('invitee')
  addresses.push(address)
  return address
}

const none = { programAccess: 'none', websiteContentAccess: 'none', ticketsAccess: 'none' }

const invite = (who: Member, body: object, slug = a.slug) =>
  request(app.getHttpServer())
    .post('/tenants/current/members')
    .set('Authorization', `Bearer ${who.token}`)
    .set('X-Tenant-Slug', slug)
    .send(body)

// Every preview sends its own address unless a test counts against one.
const preview = (token: string, ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`) =>
  request(app.getHttpServer())
    .get('/invitations/preview')
    .query({ token })
    .set('X-Forwarded-For', ip)

const accept = (token: string, accessToken?: string) => {
  const req = request(app.getHttpServer()).post('/invitations/accept').send({ token })
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req
}

/** The token from the invitation email to `address`. */
async function tokenSentTo(address: string) {
  const [mail] = await waitForMail(address)
  return invitationLinkIn(mail!).searchParams.get('token')!
}

/** A confirmed account on `email`, signed in. */
async function registered(email: string): Promise<Member> {
  const account = await createAccount({}, { email })
  return { ...account, token: await signIn(email) }
}

const claimsFor = (tenantId: string, email: string, overrides: Partial<InvitationClaims> = {}) =>
  ({
    tenantId,
    email,
    role: 'org',
    tenantPermissions: { settingsAccess: 'none', brandingAccess: 'none', shopConfigAccess: 'none' },
    editionPermissions: [],
    expiresAt: null,
    invitedBy: aHeadMembership,
    ...overrides,
  }) satisfies InvitationClaims

describe('inviting an address without an account', () => {
  it('emails a link in the tenant language, and the invitee joins with what it grants', async () => {
    const email = newAddress()
    const res = await invite(a.head, {
      email: email.toUpperCase(),
      settingsAccess: 'read',
      editions: [{ editionId: editionA, ...none, programAccess: 'write' }],
    }).expect(201)

    expect(res.body).toMatchObject({ outcome: 'invited', email })
    const validUntil = new Date((res.body as { validUntil: string }).validUntil).getTime()
    expect(validUntil - Date.now()).toBeGreaterThan((INVITATION_TTL_SECONDS - 60) * 1000)
    const [mail] = await waitForMail(email)
    expect(mail!.Subject).toBe(`Zaproszenie do zespołu organizatorów konwentu Tenant ${a.slug}`)
    expect(mail!.Text).toContain('Link jest ważny przez 7 dni i działa tylko raz.')
    const link = invitationLinkIn(mail!)
    expect(`${link.origin}${link.pathname}`).toBe(`${env.PANEL_URL}/invitation`)
    const token = link.searchParams.get('token')!

    const shown = await preview(token).expect(200)
    expect(shown.body).toEqual({
      tenant: { name: `Tenant ${a.slug}` },
      email,
      validUntil: (res.body as { validUntil: string }).validUntil,
    })

    await accept(token).expect(401)
    const invitee = await registered(email)
    const accepted = await accept(token, invitee.token).expect(201)
    expect(accepted.body).toEqual({ tenant: { id: a.id, slug: a.slug, name: `Tenant ${a.slug}` } })

    expect(await storedMembership(a.id, invitee.id)).toMatchObject({
      role: 'org',
      settingsAccess: 'read',
      brandingAccess: 'none',
      expiresAt: null,
      editions: [{ editionId: editionA, ...none, programAccess: 'write' }],
    })
    const memberships = await request(app.getHttpServer())
      .get('/me/memberships')
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(200)
    expect(memberships.body).toMatchObject([{ tenant: { id: a.id }, settingsAccess: 'read' }])
  })

  it('sends the email in English for an English tenant', async () => {
    const tenant = await tenantWithHead()
    await request(app.getHttpServer())
      .patch('/tenants/current')
      .set('Authorization', `Bearer ${tenant.head.token}`)
      .set('X-Tenant-Slug', tenant.slug)
      .send({ defaultLocale: 'en' })
      .expect(200)
    const email = newAddress()

    await invite(tenant.head, { email }, tenant.slug).expect(201)

    const [mail] = await waitForMail(email)
    expect(mail!.Subject).toBe(`Invitation to the organizing team of Tenant ${tenant.slug}`)
  })

  it('carries the largest grant the request accepts through preview and acceptance', async () => {
    // A tenant of its own: 50 editions, and this invitation outside the other tests' rate limit.
    const tenant = await tenantWithHead()
    const editions = await Promise.all(Array.from({ length: 50 }, () => addEdition(tenant.id)))
    const all = { programAccess: 'write', websiteContentAccess: 'write', ticketsAccess: 'write' }
    const email = newAddress()
    await invite(
      tenant.head,
      {
        email,
        settingsAccess: 'write',
        brandingAccess: 'write',
        shopConfigAccess: 'write',
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        editions: editions.map((editionId) => ({ editionId, ...all })),
      },
      tenant.slug,
    ).expect(201)
    const token = await tokenSentTo(email)
    const invitee = await registered(email)

    await preview(token).expect(200)
    await accept(token, invitee.token).expect(201)

    expect((await storedMembership(tenant.id, invitee.id))!.editions).toHaveLength(50)
  })

  it('works once, also after the membership it created is removed', async () => {
    const email = newAddress()
    await invite(a.head, { email }).expect(201)
    const token = await tokenSentTo(email)
    const invitee = await registered(email)
    await accept(token, invitee.token).expect(201)

    expect((await accept(token, invitee.token).expect(409)).body).toMatchObject({
      code: 'invitation.used',
    })
    expect((await preview(token).expect(409)).body).toMatchObject({ code: 'invitation.used' })
    await removeMembership((await storedMembership(a.id, invitee.id))!.id)
    expect((await accept(token, invitee.token).expect(409)).body).toMatchObject({
      code: 'invitation.used',
    })
    expect(await storedMembership(a.id, invitee.id)).toBeUndefined()
  })

  it('lets one of two concurrent acceptances through', async () => {
    const email = newAddress()
    await invite(a.head, { email }).expect(201)
    const token = await tokenSentTo(email)
    const invitee = await registered(email)

    const statuses = (
      await Promise.all([accept(token, invitee.token), accept(token, invitee.token)])
    ).map((res) => res.status)

    expect(statuses.sort()).toEqual([201, 409])
  })

  it('accepts a head invitation as a head', async () => {
    const email = newAddress()
    await invite(a.head, { email, role: 'head', settingsAccess: 'write' }).expect(201)
    const invitee = await registered(email)

    await accept(await tokenSentTo(email), invitee.token).expect(201)

    expect(await storedMembership(a.id, invitee.id)).toMatchObject({
      role: 'head',
      settingsAccess: 'none',
      editions: [],
    })
  })

  it('skips an edition deleted after the invitation went out', async () => {
    const edition = await addEdition(a.id)
    const email = newAddress()
    await invite(a.head, {
      email,
      editions: [
        { editionId: edition, ...none, ticketsAccess: 'read' },
        { editionId: editionA, ...none, programAccess: 'read' },
      ],
    }).expect(201)
    const token = await tokenSentTo(email)
    await deleteEdition(edition)
    const invitee = await registered(email)

    await accept(token, invitee.token).expect(201)

    expect((await storedMembership(a.id, invitee.id))!.editions).toEqual([
      { editionId: editionA, ...none, programAccess: 'read' },
    ])
  })

  it('skips an edition whose delete commits while the acceptance runs', async () => {
    const edition = await addEdition(a.id)
    const email = newAddress()
    await invite(a.head, {
      email,
      editions: [
        { editionId: edition, ...none, ticketsAccess: 'read' },
        { editionId: editionA, ...none, programAccess: 'read' },
      ],
    }).expect(201)
    const token = await tokenSentTo(email)
    const invitee = await registered(email)
    const commit = await holdOpen((sql) => sql`delete from editions where id = ${edition}`)

    const pending = accept(token, invitee.token).then((res) => res)
    await sleep(300)
    await commit()

    expect((await pending).status).toBe(201)
    expect((await storedMembership(a.id, invitee.id))!.editions).toEqual([
      { editionId: editionA, ...none, programAccess: 'read' },
    ])
  })
})

describe('accepting an invitation', () => {
  it('needs the invited email, confirmed, on the signed-in account', async () => {
    const email = newAddress()
    await invite(a.head, { email }).expect(201)
    const token = await tokenSentTo(email)

    const other = await member()
    expect((await accept(token, other.token).expect(403)).body).toMatchObject({
      code: 'invitation.email-mismatch',
    })
    // Without a confirmed address there is no password sign-in; a token stands for any other way in.
    const unconfirmed = await createAccount({}, { email, confirmed: false })
    const res = await accept(token, await mintToken({ sub: unconfirmed.id })).expect(403)
    expect(res.body).toMatchObject({ code: 'invitation.email-mismatch' })
    expect(await storedMembership(a.id, unconfirmed.id)).toBeUndefined()
  })

  it('answers 410 for an expired invitation and 400 for a token the API did not sign', async () => {
    const email = newAddress()
    const invitee = await registered(email)
    const old = new Date(Date.now() - (INVITATION_TTL_SECONDS + 60) * 1000)
    const expired = (await signInvitation(claimsFor(a.id, email), key, old)).token
    const forged = (await signInvitation(claimsFor(a.id, email), invitationKey('f'.repeat(32))))
      .token

    expect((await accept(expired, invitee.token).expect(410)).body).toMatchObject({
      code: 'invitation.expired',
    })
    expect((await preview(expired).expect(410)).body).toMatchObject({ code: 'invitation.expired' })
    for (const token of [forged, 'not-a-token', await mintToken({ sub: invitee.id })]) {
      expect((await accept(token, invitee.token).expect(400)).body).toMatchObject({
        code: 'invitation.invalid',
      })
      expect((await preview(token).expect(400)).body).toMatchObject({ code: 'invitation.invalid' })
    }
    expect(await storedMembership(a.id, invitee.id)).toBeUndefined()
  })

  it('answers 410 once the membership expiry the invitation grants has passed', async () => {
    const email = newAddress()
    const invitee = await registered(email)
    const lapsed = claimsFor(a.id, email, { expiresAt: new Date(Date.now() - 1000).toISOString() })
    const { token } = await signInvitation(lapsed, key)

    expect((await accept(token, invitee.token).expect(410)).body).toMatchObject({
      code: 'invitation.expired',
    })
  })

  it('answers 409 to an account already in the team', async () => {
    const existing = await member()
    await addOrg(a.id, existing, { expired: true })
    const { token } = await signInvitation(claimsFor(a.id, existing.email), key)

    expect((await accept(token, existing.token).expect(409)).body).toMatchObject({
      code: 'invitation.already-member',
    })
  })

  it('lets one of two invitations accepted at once through, and tells the other it is in', async () => {
    const email = newAddress()
    const invitee = await registered(email)
    const [one, other] = await Promise.all([
      signInvitation(claimsFor(a.id, email), key),
      signInvitation(claimsFor(a.id, email), key),
    ])

    const responses = await Promise.all([
      accept(one.token, invitee.token),
      accept(other.token, invitee.token),
    ])

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409])
    expect(responses.find((res) => res.status === 409)!.body).toMatchObject({
      code: 'invitation.already-member',
    })
  })

  it('answers 404 for an invitation to a tenant that no longer exists', async () => {
    const email = newAddress()
    const invitee = await registered(email)
    const { token } = await signInvitation(claimsFor(randomUUID(), email), key)

    await accept(token, invitee.token).expect(404)
    await preview(token).expect(404)
  })
})

describe('inviting a known account', () => {
  it('adds a confirmed account at once and notifies it in its own language', async () => {
    const known = await createAccount({ locale: 'en' })
    addresses.push(known.email)

    const res = await invite(a.head, {
      email: known.email,
      brandingAccess: 'read',
      editions: [{ editionId: editionA, ...none, programAccess: 'read' }],
    }).expect(201)

    expect(res.body).toMatchObject({
      outcome: 'added',
      member: {
        account: { id: known.id, email: known.email },
        role: 'org',
        brandingAccess: 'read',
      },
    })
    expect((await storedMembership(a.id, known.id))!.editions).toEqual([
      { editionId: editionA, ...none, programAccess: 'read' },
    ])
    const [mail] = await waitForMail(known.email)
    expect(mail!.Subject).toBe(`You have joined the organizing team of Tenant ${a.slug}`)
    expect(mail!.Text).toContain(`${env.PANEL_URL}/${a.slug}`)
  })

  it('answers 409 for an account already in the team, an expired membership included', async () => {
    const lapsed = await member()
    await addOrg(a.id, lapsed, { expired: true })

    expect((await invite(a.head, { email: lapsed.email }).expect(409)).body).toMatchObject({
      code: 'member.exists',
    })
    expect((await invite(a.head, { email: a.head.email }).expect(409)).body).toMatchObject({
      code: 'member.exists',
    })
  })

  it('treats an account with an unconfirmed email as no account', async () => {
    const email = newAddress()
    const unconfirmed = await createAccount({}, { email, confirmed: false })

    const res = await invite(a.head, { email }).expect(201)

    expect(res.body).toMatchObject({ outcome: 'invited', email })
    expect(await storedMembership(a.id, unconfirmed.id)).toBeUndefined()
    await tokenSentTo(email)
  })
})

describe('invitation anti-escalation', () => {
  // A tenant of its own, so these invitations stay out of the other tests' rate limit counter.
  let t: Awaited<ReturnType<typeof tenantWithHead>>
  let edition: string
  let writer: Member
  let expiring: Member
  const ends = new Date(Date.now() + 10 * 24 * 3600 * 1000)

  beforeAll(async () => {
    t = await tenantWithHead()
    edition = await addEdition(t.id)
    ;[writer, expiring] = await Promise.all([member(), member()])
    const writerMembership = await addOrg(t.id, writer, { settings: 'write' })
    await addEditionAccess(t.id, writerMembership, edition, { program: 'read' })
    await addOrg(t.id, expiring, { settings: 'write', expiresAt: ends })
  })

  const refused = async (who: Member, body: object, code: string) =>
    expect(
      (await invite(who, { email: newAddress(), ...body }, t.slug).expect(403)).body,
    ).toMatchObject({ code })

  it('caps an org at its own permissions on both levels', async () => {
    await refused(writer, { role: 'head' }, 'member.above-own')
    await refused(writer, { brandingAccess: 'read' }, 'member.above-own')
    await refused(
      writer,
      { editions: [{ editionId: edition, ...none, programAccess: 'write' }] },
      'member.above-own',
    )
    await invite(
      writer,
      {
        email: newAddress(),
        settingsAccess: 'write',
        editions: [{ editionId: edition, ...none, programAccess: 'read' }],
      },
      t.slug,
    ).expect(201)
  })

  it('keeps the access an expiring org grants within its own end', async () => {
    await refused(expiring, {}, 'member.expiry-after-own')
    await refused(
      expiring,
      { expiresAt: new Date(ends.getTime() + 1000).toISOString() },
      'member.expiry-after-own',
    )
    await invite(expiring, { email: newAddress(), expiresAt: ends.toISOString() }, t.slug).expect(
      201,
    )
  })

  it('needs settings=write and a membership in the tenant', async () => {
    const reader = await member()
    await addOrg(t.id, reader, { settings: 'read' })

    for (const who of [reader, b.head]) {
      expect((await invite(who, { email: newAddress() }, t.slug).expect(403)).body).toMatchObject({
        code: 'permission.denied',
      })
    }
  })

  it('answers 404 for an edition whose delete commits while the invitation is sent', async () => {
    const doomed = await addEdition(t.id)
    const known = await createAccount()
    const commit = await holdOpen((sql) => sql`delete from editions where id = ${doomed}`)

    const pending = invite(
      t.head,
      { email: known.email, editions: [{ editionId: doomed, ...none, programAccess: 'read' }] },
      t.slug,
    ).then((res) => res)
    await sleep(300)
    await commit()

    expect((await pending).status).toBe(404)
    expect(await storedMembership(t.id, known.id)).toBeUndefined()
  })

  it("answers 404 for another tenant's edition or an unknown one", async () => {
    for (const editionId of [editionB, randomUUID()]) {
      await invite(
        t.head,
        { email: newAddress(), editions: [{ editionId, ...none }] },
        t.slug,
      ).expect(404)
    }
  })

  it('validates the request', async () => {
    const cases: [object, string][] = [
      [{ email: 'not-an-email' }, 'email'],
      [{ email: newAddress(), role: 'head', expiresAt: ends.toISOString() }, 'expiresAt'],
      [{ email: newAddress(), expiresAt: new Date(Date.now() - 1000).toISOString() }, 'expiresAt'],
      [
        {
          email: newAddress(),
          editions: [
            { editionId: edition, ...none },
            { editionId: edition, ...none },
          ],
        },
        'editions',
      ],
      [{ email: newAddress(), tenantId: b.id }, 'tenantId'],
    ]
    for (const [body, field] of cases) {
      expect((await invite(t.head, body, t.slug).expect(400)).body).toMatchObject({
        code: 'request.invalid',
        params: { field },
      })
    }
  })
})

describe("an invitation and its sender's standing", () => {
  // A tenant of its own, so these invitations stay out of the other tests' rate limit counter.
  let t: Awaited<ReturnType<typeof tenantWithHead>>
  let edition: string

  beforeAll(async () => {
    t = await tenantWithHead()
    edition = await addEdition(t.id)
  })

  /** An org with settings=write and program=write in the edition, and its membership id. */
  async function sender(access: { expiresAt?: Date } = {}) {
    const org = await member()
    const id = await addOrg(t.id, org, { settings: 'write', ...access })
    await addEditionAccess(t.id, id, edition, { program: 'write' })
    return { org, id }
  }

  /** The token of an invitation `from` sends, with the confirmed account that will accept it. */
  async function invitationFrom(from: Member, body: object = {}) {
    const email = newAddress()
    await invite(from, { email, ...body }, t.slug).expect(201)
    return { token: await tokenSentTo(email), invitee: await registered(email) }
  }

  const asHead = (method: 'patch' | 'put' | 'delete', path: string, body?: object) => {
    const server = request(app.getHttpServer())
    const req =
      method === 'patch'
        ? server.patch(path)
        : method === 'put'
          ? server.put(path)
          : server.delete(path)
    return req
      .set('Authorization', `Bearer ${t.head.token}`)
      .set('X-Tenant-Slug', t.slug)
      .send(body)
  }

  const revoked = async ({ token, invitee }: Awaited<ReturnType<typeof invitationFrom>>) => {
    expect((await preview(token).expect(410)).body).toMatchObject({ code: 'invitation.revoked' })
    expect((await accept(token, invitee.token).expect(410)).body).toMatchObject({
      code: 'invitation.revoked',
    })
    expect(await storedMembership(t.id, invitee.id)).toBeUndefined()
  }

  const grant = () => ({ settingsAccess: 'write', editions: [{ editionId: edition, ...none }] })

  it('stands while the org that sent it could still send it', async () => {
    const { org } = await sender()
    const sent = await invitationFrom(org, {
      ...grant(),
      editions: [{ editionId: edition, ...none, programAccess: 'write' }],
    })

    await preview(sent.token).expect(200)
    await accept(sent.token, sent.invitee.token).expect(201)
  })

  it('goes once the org that sent it is removed from the team', async () => {
    const { org, id } = await sender()
    const sent = await invitationFrom(org, grant())

    await asHead('delete', `/tenants/current/members/${id}`).expect(204)

    await revoked(sent)
  })

  it('goes once the org that sent it loses settings=write', async () => {
    const { org, id } = await sender()
    const sent = await invitationFrom(org)

    await asHead('patch', `/tenants/current/members/${id}`, { settingsAccess: 'read' }).expect(200)

    await revoked(sent)
  })

  it('goes once the org no longer holds what it granted, and stays within what it holds', async () => {
    const { org, id } = await sender()
    const above = await invitationFrom(org, {
      editions: [{ editionId: edition, ...none, programAccess: 'write' }],
    })
    const within = await invitationFrom(org, {
      editions: [{ editionId: edition, ...none, programAccess: 'read' }],
    })

    await asHead('put', `/editions/${edition}/members/${id}`, {
      ...none,
      programAccess: 'read',
    }).expect(200)

    await revoked(above)
    await accept(within.token, within.invitee.token).expect(201)
  })

  it("goes once the org's own access ends before the access it granted", async () => {
    const { org, id } = await sender()
    const sent = await invitationFrom(org)

    const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    await asHead('patch', `/tenants/current/members/${id}`, { expiresAt: soon }).expect(200)

    await revoked(sent)
  })

  it('goes once the org that sent it has expired', async () => {
    const { org, id } = await sender({ expiresAt: new Date(Date.now() + 3600 * 1000) })
    const sent = await invitationFrom(org, {
      expiresAt: new Date(Date.now() + 1800 * 1000).toISOString(),
    })

    await asHead('patch', `/tenants/current/members/${id}`, {
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    }).expect(200)
    await sleep(1500)

    await revoked(sent)
  })
})

describe('tenant isolation', () => {
  it('lands an accepted invitation in its own tenant only', async () => {
    const email = newAddress()
    await invite(b.head, { email, settingsAccess: 'write' }, b.slug).expect(201)
    const invitee = await registered(email)

    await accept(await tokenSentTo(email), invitee.token).expect(201)

    expect(await storedMembership(b.id, invitee.id)).toMatchObject({ settingsAccess: 'write' })
    expect(await storedMembership(a.id, invitee.id)).toBeUndefined()
    await request(app.getHttpServer())
      .get('/tenants/current/members')
      .set('Authorization', `Bearer ${invitee.token}`)
      .set('X-Tenant-Slug', a.slug)
      .expect(403)
  })

  it('refuses a token that names another tenant than the one that signed it', async () => {
    const email = newAddress()
    const invitee = await registered(email)
    // A token is bound to its signature: changing the tenant breaks it.
    const { token } = await signInvitation(claimsFor(a.id, email), key)
    const [header, payload, signature] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as InvitationClaims
    const tampered = Buffer.from(JSON.stringify({ ...claims, tenantId: b.id })).toString(
      'base64url',
    )

    await accept(`${header}.${tampered}.${signature}`, invitee.token).expect(400)
    expect(await storedMembership(b.id, invitee.id)).toBeUndefined()
  })
})

describe('invitation rate limits', () => {
  it('answers 429 to the preview above 30 an hour from one address', async () => {
    const { token } = await signInvitation(claimsFor(a.id, newAddress()), key)
    const ip = '203.0.113.77'

    for (let i = 0; i < ROUTE_RATE_LIMITS.invitationPreview.limit; i++) {
      await preview(token, ip).expect(200)
    }
    const res = await preview(token, ip).expect(429)

    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    await preview(token, '203.0.113.78').expect(200)
  })

  it('answers 429 to invitations above 20 an hour in one tenant', async () => {
    const tenant = await tenantWithHead()

    // Each one is refused after it counts, so no email goes out.
    for (let i = 0; i < ROUTE_RATE_LIMITS.invitations.limit; i++) {
      await invite(tenant.head, { email: tenant.head.email }, tenant.slug).expect(409)
    }
    const res = await invite(tenant.head, { email: newAddress() }, tenant.slug).expect(429)

    expect(res.body).toMatchObject({ code: 'request.rate-limited' })
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    await invite(b.head, { email: b.head.email }, b.slug).expect(409)
  })
})
