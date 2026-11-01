import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { MAX_SPEAKERS, type ProgramItem } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeakersEditor } from './speakers-editor'

const put = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({ useCurrentTenant: () => ({ api: {} }) }))
vi.mock('../api/program', () => ({
  putSpeakersOptions: () => ({ mutationFn: put }),
  programKey: () => ['program'],
}))

const account = (email: string) => ({ id: email, email, firstName: null, lastName: null })

const item = (speakers: ProgramItem['speakers'] = []): ProgramItem => ({
  id: 'item-1',
  editionId: 'edition-1',
  title: 'Panel',
  description: null,
  startsAt: '2027-05-01T08:00:00.000Z',
  endsAt: '2027-05-01T09:00:00.000Z',
  speakers,
})

const view = (props: { item: ProgramItem; canWrite: boolean }) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <SpeakersEditor {...props} />
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  put.mockReset()
  put.mockResolvedValue({})
})

afterEach(cleanup)

const params = { editionId: 'edition-1', programItemId: 'item-1' }

describe('SpeakersEditor', () => {
  it('sends the whole list with the new address', async () => {
    const user = userEvent.setup()
    view({ item: item([account('a@x.test')]), canWrite: true })

    await user.type(screen.getByLabelText('Speaker email'), 'New@X.test')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(put.mock.calls[0]?.[0]).toEqual({
      params,
      body: { emails: ['a@x.test', 'new@x.test'] },
    })
  })

  it('sends the list without the speaker removed', async () => {
    const user = userEvent.setup()
    view({ item: item([account('a@x.test'), account('b@x.test')]), canWrite: true })

    await user.click(screen.getByRole('button', { name: 'Remove a@x.test' }))

    expect(put.mock.calls[0]?.[0]).toEqual({ params, body: { emails: ['b@x.test'] } })
  })

  it('refuses something that is not an address without calling the API', async () => {
    const user = userEvent.setup()
    view({ item: item(), canWrite: true })

    await user.type(screen.getByLabelText('Speaker email'), 'not-an-address')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeDefined()
    expect(put).not.toHaveBeenCalled()
  })

  it('takes no more addresses at the limit', () => {
    const full = Array.from({ length: MAX_SPEAKERS }, (_, index) => account(`s${index}@x.test`))
    view({ item: item(full), canWrite: true })

    expect(screen.queryByLabelText('Speaker email')).toBeNull()
    expect(screen.getByText('An item can have up to 10 speakers.')).toBeDefined()
  })

  it('states the limit through the plural of the Polish catalog', async () => {
    const { messages } = await import('../../../locales/pl.mjs')
    i18n.loadAndActivate({ locale: 'pl', messages })
    const full = Array.from({ length: MAX_SPEAKERS }, (_, index) => account(`s${index}@x.test`))
    view({ item: item(full), canWrite: true })

    expect(screen.getByText('Punkt programu może mieć do 10 prelegentów.')).toBeDefined()

    i18n.loadAndActivate({ locale: 'en', messages: {} })
  })

  it('only lists the speakers for a member who reads the programme', () => {
    view({ item: item([account('a@x.test')]), canWrite: false })

    expect(screen.getByText('a@x.test')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText('Speaker email')).toBeNull()
  })

  it('says when there are no speakers', () => {
    view({ item: item(), canWrite: false })

    expect(screen.getByText('This item has no speakers yet.')).toBeDefined()
  })
})
