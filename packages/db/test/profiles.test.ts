import { describe, expect, it } from 'vitest'
import { adminReads, adminUpdates, globalReads } from '../src/verify'
import { admin, app, authAdmin, createUser, global, migrator } from './db'

// The rows of the public profile (docs/specs/0016-public-profile.md): an account's profile, the
// pointer at its avatar and the reports of the profile. Global tables, as accounts is: no RLS,
// limited by privileges.

const SHA = 'a'.repeat(64)

const profile = async (values: Record<string, unknown> = {}) => {
  const user = await createUser()
  await migrator`insert into account_profiles ${migrator({ account_id: user.id, ...values })}`
  return user
}

const takenDown = () =>
  profile({
    taken_down_at: new Date(),
    taken_down_reason: 'spam',
    taken_down_after_report: false,
  })

const fileOf = async (accountId: string) => {
  const [file] = await migrator<{ id: string }[]>`
    insert into account_files (account_id, kind, content_type, size, sha256, name, width, height)
    values (${accountId}, 'profile-avatar', 'image/png', 10, ${SHA}, 'avatar', 4, 3)
    returning id
  `
  return file!.id
}

const report = async (accountId: string, values: Record<string, unknown> = {}) => {
  const [row] = await migrator<{ id: string }[]>`
    insert into profile_reports ${migrator({ account_id: accountId, reason: 'spam', ...values })}
    returning id
  `
  return row!.id
}

const columnsOf = async (table: string) =>
  (
    await migrator<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = ${table}
    `
  ).map((row) => row.column_name)

const denied = /permission denied/

describe('account_profiles', () => {
  it('starts private and empty, with a public identifier the database gives', async () => {
    const user = await profile()

    const [row] = await migrator`select * from account_profiles where account_id = ${user.id}`
    expect(row).toMatchObject({
      published_at: null,
      taken_down_at: null,
      taken_down_reason: null,
      taken_down_note: null,
      taken_down_after_report: null,
      review_requested_at: null,
      description: null,
      pronouns: null,
      city: null,
      links: [],
      interests: [],
    })
    expect(row!.public_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(row!.public_id).not.toBe(user.id)
  })

  it('is one an account', async () => {
    const user = await profile()

    await expect(
      migrator`insert into account_profiles (account_id) values (${user.id})`,
    ).rejects.toThrow(/account_profiles_pkey/)
  })

  it('gives every profile a public identifier of its own', async () => {
    const [a, b] = await Promise.all([profile(), profile()])
    const [taken] = await migrator<{ public_id: string }[]>`
      select public_id from account_profiles where account_id = ${a.id}
    `

    await expect(
      migrator`update account_profiles set public_id = ${taken!.public_id} where account_id = ${b.id}`,
    ).rejects.toThrow(/account_profiles_public_id_unique/)
  })

  it('goes with its account, and takes its avatar and its reports with it', async () => {
    const user = await profile()
    await migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${await fileOf(user.id)})`
    await report(user.id)

    await authAdmin`delete from auth.users where id = ${user.id}`

    for (const table of ['account_profiles', 'account_avatars', 'profile_reports']) {
      expect(
        await migrator.unsafe(`select 1 from ${table} where account_id = '${user.id}'`),
      ).toHaveLength(0)
    }
  })

  // P9 and T4: a profile taken down is never public.
  it('refuses a profile that is published and taken down at once', async () => {
    const published = await profile({ published_at: new Date() })
    const down = await takenDown()

    await expect(
      migrator`
        update account_profiles
        set taken_down_at = now(), taken_down_reason = 'spam', taken_down_after_report = true
        where account_id = ${published.id}
      `,
    ).rejects.toThrow(/account_profiles_public_or_taken_down/)
    await expect(
      migrator`update account_profiles set published_at = now() where account_id = ${down.id}`,
    ).rejects.toThrow(/account_profiles_public_or_taken_down/)
  })

  it.each([
    ['a takedown with no reason', { taken_down_at: new Date(), taken_down_after_report: true }],
    [
      'a takedown that does not say whether it followed a report',
      { taken_down_at: new Date(), taken_down_reason: 'spam' },
    ],
    [
      'another reason, which no rule of the terms stands behind',
      { taken_down_at: new Date(), taken_down_reason: 'other', taken_down_after_report: true },
    ],
    ['a reason with no takedown', { taken_down_reason: 'spam' }],
    ['a sentence of the admin with no takedown', { taken_down_note: 'Spam.' }],
    ['a request for a review with no takedown', { review_requested_at: new Date() }],
  ])('refuses %s', async (_, values) => {
    const user = await createUser()

    await expect(
      migrator`insert into account_profiles ${migrator({ account_id: user.id, ...values })}`,
    ).rejects.toThrow(/account_profiles_takedown/)
  })

  it('takes a takedown with its reason, its sentence and a request for a review', async () => {
    const user = await takenDown()

    await migrator`
      update account_profiles
      set taken_down_note = ${'x'.repeat(500)}, review_requested_at = now()
      where account_id = ${user.id}
    `
  })

  it.each([
    ['description', 500, 'account_profiles_description'],
    ['pronouns', 30, 'account_profiles_pronouns'],
    ['city', 80, 'account_profiles_city'],
  ])('refuses an empty %s and one over %i characters', async (column, max, constraint) => {
    const user = await profile({ [column]: 'x'.repeat(max) })

    for (const text of ['', 'x'.repeat(max + 1)]) {
      await expect(
        migrator`update account_profiles set ${migrator({ [column]: text })} where account_id = ${user.id}`,
      ).rejects.toThrow(new RegExp(constraint))
    }
  })

  it('refuses a sentence of the admin over 500 characters', async () => {
    const user = await takenDown()

    await expect(
      migrator`update account_profiles set taken_down_note = ${'x'.repeat(501)} where account_id = ${user.id}`,
    ).rejects.toThrow(/account_profiles_takedown_note/)
  })

  it('takes up to three https links of up to 200 characters', async () => {
    const longest = `https://${'x'.repeat(192)}`
    const user = await profile({
      links: ['https://example.test/me', 'https://example.test/?a=1&b=%20', longest],
    })

    expect(
      await migrator`select cardinality(links) as links from account_profiles where account_id = ${user.id}`,
    ).toEqual([{ links: 3 }])
  })

  it.each([
    ['a fourth link', ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test']],
    ['a link that is not https', ['http://example.test']],
    ['a script as a link', ['javascript:alert(1)']],
    ['a link with a space', ['https://example.test/a b']],
    ['a link with a line break', ['https://example.test/a\nhttps://b.test']],
    ['a link over 200 characters', [`https://${'x'.repeat(193)}`]],
    ['a link that is the scheme alone', ['https://']],
  ])('refuses %s', async (_, links) => {
    const user = await createUser()

    await expect(
      migrator`insert into account_profiles ${migrator({ account_id: user.id, links })}`,
    ).rejects.toThrow(/account_profiles_links/)
  })

  it('refuses a missing link among the links, and an interest the platform does not list', async () => {
    const user = await profile({ interests: ['larp', 'cosplay'] })

    await expect(
      migrator`update account_profiles set links = array['https://a.test', null] where account_id = ${user.id}`,
    ).rejects.toThrow(/account_profiles_links/)
    await expect(
      migrator`update account_profiles set interests = array['larp', null]::profile_interest[] where account_id = ${user.id}`,
    ).rejects.toThrow(/account_profiles_interests/)
    await expect(
      migrator`update account_profiles set interests = '{knitting}' where account_id = ${user.id}`,
    ).rejects.toThrow(/invalid input value for enum profile_interest/)
  })

  it('keeps updated_at current', async () => {
    const user = await profile()
    await migrator`update account_profiles set updated_at = now() - interval '1 day' where account_id = ${user.id}`

    await migrator`update account_profiles set city = 'Gdynia' where account_id = ${user.id}`

    expect(
      await migrator`select updated_at > now() - interval '1 minute' as current from account_profiles where account_id = ${user.id}`,
    ).toEqual([{ current: true }])
  })
})

describe('account_profiles on the runtime roles', () => {
  it('lets opos_app keep what a profile holds, publish it and ask for a review', async () => {
    const user = await createUser()

    await app`
      insert into account_profiles (account_id, description, pronouns, city, links, interests)
      values (${user.id}, 'Hi.', 'she/her', 'Gdynia', '{https://example.test}', '{larp}')
    `
    await app`
      update account_profiles
      set description = null, pronouns = null, city = null, links = '{}', interests = '{}',
        published_at = now()
      where account_id = ${user.id}
    `
    expect(
      await app`select published_at is not null as published, public_id from account_profiles where account_id = ${user.id}`,
    ).toMatchObject([{ published: true }])

    const down = await takenDown()
    await app`update account_profiles set review_requested_at = now() where account_id = ${down.id}`
  })

  // An account cannot end a takedown by itself, nor start again under another identifier.
  it('lets opos_app set no public identifier, nothing a takedown sets, and delete no profile', async () => {
    const [user, other] = await Promise.all([profile(), createUser()])

    for (const query of [
      app`insert into account_profiles (account_id, public_id) values (${other.id}, gen_random_uuid())`,
      app`insert into account_profiles (account_id, taken_down_at) values (${other.id}, null)`,
      app`update account_profiles set public_id = gen_random_uuid() where account_id = ${user.id}`,
      app`update account_profiles set account_id = ${other.id} where account_id = ${user.id}`,
      app`update account_profiles set taken_down_at = null where account_id = ${user.id}`,
      app`update account_profiles set taken_down_reason = null where account_id = ${user.id}`,
      app`update account_profiles set taken_down_note = null where account_id = ${user.id}`,
      app`update account_profiles set taken_down_after_report = null where account_id = ${user.id}`,
      app`update account_profiles set updated_at = now() where account_id = ${user.id}`,
      app`delete from account_profiles where account_id = ${user.id}`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
  })

  it.each(['account_profiles', 'account_avatars'])(
    'lets opos_app_global read of %s only what a public read answers, and write nothing',
    async (table) => {
      const user = await profile()

      for (const column of await columnsOf(table)) {
        const query = global.unsafe(`select ${column} from ${table} limit 1`)
        if (globalReads.includes(`${table}.${column}`)) await query
        else await expect(query).rejects.toThrow(denied)
      }
      for (const query of [
        global.unsafe(`select * from ${table} limit 1`),
        global.unsafe(`update ${table} set account_id = account_id`),
        global.unsafe(`delete from ${table}`),
        global.unsafe(`insert into ${table} (account_id) values ('${user.id}')`),
      ]) {
        await expect(query).rejects.toThrow(denied)
      }
    },
  )

  it('lets opos_app_global read a published profile and never what a takedown says', () => {
    expect(globalReads).toEqual(
      expect.arrayContaining([
        'account_profiles.public_id',
        'account_profiles.published_at',
        'account_profiles.description',
        'account_avatars.file_id',
      ]),
    )
    for (const column of [
      'taken_down_at',
      'taken_down_reason',
      'taken_down_note',
      'taken_down_after_report',
      'review_requested_at',
    ]) {
      expect(globalReads).not.toContain(`account_profiles.${column}`)
    }
  })

  it('lets opos_admin read a profile, take it down and restore it, and change nothing it says', async () => {
    const user = await profile({ published_at: new Date(), description: 'Hi.' })

    for (const column of await columnsOf('account_profiles')) {
      expect(adminReads).toContain(`account_profiles.${column}`)
      await admin.unsafe(`select ${column} from account_profiles limit 1`)
    }
    await admin`
      update account_profiles
      set published_at = null, taken_down_at = now(), taken_down_reason = 'offensive',
        taken_down_note = 'See the terms.', taken_down_after_report = true
      where account_id = ${user.id}
    `
    await admin`
      update account_profiles
      set taken_down_at = null, taken_down_reason = null, taken_down_note = null,
        taken_down_after_report = null, review_requested_at = null
      where account_id = ${user.id}
    `
    for (const query of [
      admin`update account_profiles set description = null where account_id = ${user.id}`,
      admin`update account_profiles set links = '{}' where account_id = ${user.id}`,
      admin`update account_profiles set public_id = gen_random_uuid() where account_id = ${user.id}`,
      admin`delete from account_profiles where account_id = ${user.id}`,
      admin`insert into account_profiles (account_id) values (${user.id})`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
  })
})

describe('account_avatars', () => {
  it('points at a file of its own account, one an account', async () => {
    const [user, other] = await Promise.all([profile(), profile()])
    const [mine, theirs] = await Promise.all([fileOf(user.id), fileOf(other.id)])

    await expect(
      migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${theirs})`,
    ).rejects.toThrow(/account_avatars_file_fk/)
    await migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${mine})`
    await expect(
      migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${await fileOf(user.id)})`,
    ).rejects.toThrow(/account_avatars_pkey/)
  })

  // An avatar is read by its file's identifier alone, on a route anyone calls: the constraint
  // that says a file is one avatar is also the index that finds it.
  it('is found by its file through a unique index', async () => {
    const constraints = await migrator<{ contype: string; columns: string }[]>`
      select contype, pg_get_constraintdef(oid) as columns from pg_constraint
      where conname = 'account_avatars_file_unique'
        and conrelid = 'public.account_avatars'::regclass
    `

    expect(constraints).toEqual([{ contype: 'u', columns: 'UNIQUE (file_id)' }])
  })

  it('needs a profile, and goes with its file', async () => {
    const [user, bare] = await Promise.all([profile(), createUser()])
    const file = await fileOf(user.id)

    await expect(
      migrator`insert into account_avatars (account_id, file_id) values (${bare.id}, ${await fileOf(bare.id)})`,
    ).rejects.toThrow(/account_avatars_profile_fk/)
    await migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${file})`
    await migrator`delete from account_files where id = ${file}`

    expect(
      await migrator`select 1 from account_avatars where account_id = ${user.id}`,
    ).toHaveLength(0)
  })

  it('lets opos_app add and remove the pointer and never change it', async () => {
    const user = await profile()
    const [first, second] = await Promise.all([fileOf(user.id), fileOf(user.id)])

    await app`insert into account_avatars (account_id, file_id) values (${user.id}, ${first})`
    expect(await app`select file_id from account_avatars where account_id = ${user.id}`).toEqual([
      { file_id: first },
    ])
    await expect(
      app`update account_avatars set file_id = ${second} where account_id = ${user.id}`,
    ).rejects.toThrow(denied)
    await app`delete from account_avatars where account_id = ${user.id}`
  })

  it('lets opos_admin read the pointer and remove it, and add none', async () => {
    const user = await profile()
    const file = await fileOf(user.id)
    await migrator`insert into account_avatars (account_id, file_id) values (${user.id}, ${file})`

    expect(
      await admin`select account_id, file_id, created_at is not null as dated from account_avatars where account_id = ${user.id}`,
    ).toEqual([{ account_id: user.id, file_id: file, dated: true }])
    await expect(
      admin`update account_avatars set file_id = ${file} where account_id = ${user.id}`,
    ).rejects.toThrow(denied)
    await admin`delete from account_avatars where account_id = ${user.id}`
    await expect(
      admin`insert into account_avatars (account_id, file_id) values (${user.id}, ${file})`,
    ).rejects.toThrow(denied)
  })
})

describe('profile_reports', () => {
  it('keeps a reason, and a note and an email address with its language when they were given', async () => {
    const user = await profile()

    await report(user.id)
    await report(user.id, {
      reason: 'identity',
      note: 'x'.repeat(1000),
      email: 'someone@example.test',
      locale: 'pl',
    })

    expect(
      await migrator`select count(*)::int as open from profile_reports where account_id = ${user.id} and closed_at is null`,
    ).toEqual([{ open: 2 }])
  })

  it.each([
    ['an empty note', { note: '' }, 'profile_reports_note'],
    ['a note over 1000 characters', { note: 'x'.repeat(1001) }, 'profile_reports_note'],
    ['an email address with no language', { email: 'a@example.test' }, 'profile_reports_email'],
    ['a language with no email address', { locale: 'pl' }, 'profile_reports_email'],
    [
      'an email address over 320 characters',
      { email: `${'x'.repeat(309)}@example.test`, locale: 'en' },
      'profile_reports_email',
    ],
  ])('refuses %s', async (_, values, constraint) => {
    const user = await profile()

    await expect(report(user.id, values)).rejects.toThrow(new RegExp(constraint))
  })

  it('refuses a reason the platform does not list, and a report of no profile', async () => {
    const [user, bare] = await Promise.all([profile(), createUser()])

    await expect(report(user.id, { reason: 'boring' })).rejects.toThrow(
      /invalid input value for enum profile_report_reason/,
    )
    await expect(report(bare.id)).rejects.toThrow(/profile_reports_profile_fk/)
  })

  // R3 and R9: the API keeps a report and removes an old one, and reads nothing a report says.
  it('lets opos_app add a report, count the open ones and remove one, and read nothing it says', async () => {
    const user = await profile()

    await app`
      insert into profile_reports (account_id, reason, note, email, locale)
      values (${user.id}, 'offensive', 'Look at the picture.', 'someone@example.test', 'en')
    `
    expect(
      await app`select count(*)::int as open from profile_reports where account_id = ${user.id} and closed_at is null`,
    ).toEqual([{ open: 1 }])
    for (const query of [
      app`select * from profile_reports where account_id = ${user.id}`,
      app`select id from profile_reports where account_id = ${user.id}`,
      app`select reason from profile_reports where account_id = ${user.id}`,
      app`select note from profile_reports where account_id = ${user.id}`,
      app`select email from profile_reports where account_id = ${user.id}`,
      app`select locale from profile_reports where account_id = ${user.id}`,
      app`update profile_reports set closed_at = now() where account_id = ${user.id}`,
      app`insert into profile_reports (account_id, reason, closed_at) values (${user.id}, 'spam', now())`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
    await app`delete from profile_reports where account_id = ${user.id} and closed_at < now()`
  })

  it('gives opos_app_global nothing', async () => {
    const user = await profile()
    await report(user.id)

    for (const query of [
      global`select 1 from profile_reports`,
      global`select account_id from profile_reports`,
      global`delete from profile_reports`,
      global`insert into profile_reports (account_id, reason) values (${user.id}, 'spam')`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
  })

  it('lets opos_admin read a report and close it, and change nothing else', async () => {
    const user = await profile()
    const id = await report(user.id, { note: 'Spam.', email: 'a@example.test', locale: 'en' })

    for (const column of await columnsOf('profile_reports')) {
      expect(adminReads).toContain(`profile_reports.${column}`)
    }
    expect(
      await admin`select reason, note, email, locale from profile_reports where id = ${id}`,
    ).toEqual([{ reason: 'spam', note: 'Spam.', email: 'a@example.test', locale: 'en' }])
    await admin`update profile_reports set closed_at = now() where id = ${id}`
    expect(adminUpdates).toContain('profile_reports.closed_at')
    for (const query of [
      admin`update profile_reports set note = null where id = ${id}`,
      admin`update profile_reports set email = null, locale = null where id = ${id}`,
      admin`delete from profile_reports where id = ${id}`,
      admin`insert into profile_reports (account_id, reason) values (${user.id}, 'spam')`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
  })
})

describe('the name of an account on the roles that read across accounts', () => {
  // docs/adr/0071-let-anyone-read-the-profile-an-account-published.md.
  it('lets opos_app_global read the public name alone, and never the email address', async () => {
    const user = await createUser({ first_name: 'Anna' })

    expect(
      await global`select id, first_name, last_name, nickname, name_order from accounts where id = ${user.id}`,
    ).toEqual([
      {
        id: user.id,
        first_name: 'Anna',
        last_name: null,
        nickname: null,
        name_order: 'nickname-middle',
      },
    ])
    for (const column of await columnsOf('accounts')) {
      const readable = ['id', 'first_name', 'last_name', 'nickname', 'name_order'].includes(column)
      expect(globalReads.includes(`accounts.${column}`)).toBe(readable)
      if (!readable) {
        await expect(global.unsafe(`select ${column} from accounts limit 1`)).rejects.toThrow(
          denied,
        )
      }
    }
  })

  // T10: an admin clears a name and changes nothing else of an account.
  it('lets opos_admin read the nickname and clear the three parts of a name', async () => {
    const user = await createUser({ first_name: 'Anna', last_name: 'Nowak' })
    await migrator`update accounts set nickname = 'Lisek' where id = ${user.id}`

    await admin`update accounts set first_name = null, nickname = null, last_name = null where id = ${user.id}`
    expect(
      await admin`select first_name, nickname, last_name, name_order from accounts where id = ${user.id}`,
    ).toEqual([
      { first_name: null, nickname: null, last_name: null, name_order: 'nickname-middle' },
    ])
    for (const query of [
      admin`update accounts set email = 'x@example.test' where id = ${user.id}`,
      admin`update accounts set name_order = 'nickname-last' where id = ${user.id}`,
      admin`update accounts set locale = 'en' where id = ${user.id}`,
      admin`delete from accounts where id = ${user.id}`,
    ]) {
      await expect(query).rejects.toThrow(denied)
    }
  })
})
