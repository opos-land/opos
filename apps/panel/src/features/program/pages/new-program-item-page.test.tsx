import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditionBySlug } from '../../editions'
import { NewProgramItemPage } from './new-program-item-page'

const create = vi.hoisted(() => vi.fn())
const level = vi.hoisted(() => ({ program: 'none' }))

vi.mock('../../editions', () => ({ useEditionBySlug: vi.fn() }))
vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a' },
    access: { edition: () => level },
    api: {},
  }),
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    fromInput: (value: string) => (value ? `${value}:00.000Z` : null),
  }),
}))
vi.mock('../api/program', () => ({
  programKey: () => ['program'],
  createProgramItemOptions: () => ({ mutationFn: create }),
}))

function setEdition(edition: { id: string; name: string; slug: string } | undefined) {
  vi.mocked(useEditionBySlug).mockReturnValue({
    edition,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useEditionBySlug>)
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2027/program/new']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/program/new"
              element={<NewProgramItemPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/program/:programItemId"
              element={<p>the page of the new item</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  create.mockReset()
  level.program = 'write'
  setEdition({ id: 'edition-1', name: 'Edition 2027', slug: '2027' })
})

afterEach(cleanup)

describe('NewProgramItemPage', () => {
  it('is closed to a member who only reads the programme', () => {
    level.program = 'read'
    view()

    expect(screen.getByRole('heading', { name: /permissions/i })).toBeDefined()
    expect(screen.queryByLabelText('Title')).toBeNull()
  })

  it('is closed for an edition the member does not see', () => {
    setEdition(undefined)
    view()

    expect(screen.getByRole('heading', { name: /permissions/i })).toBeDefined()
  })

  it('names itself in the page and in the browser tab, and links back to the programme', () => {
    view()

    expect(screen.getByRole('heading', { name: 'New programme item', level: 1 })).toBeDefined()
    expect(document.title).toBe('New programme item · Edition 2027 · OPOS panel')
    expect(screen.getByRole('link', { name: 'All programme items' }).getAttribute('href')).toBe(
      '/convention-a/editions/2027/program',
    )
  })

  it('adds the item and opens its page, where its speakers are set', async () => {
    create.mockResolvedValue({ id: 'item-9', title: 'Opening ceremony' })
    view()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Opening ceremony' } })
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '2027-06-04T10:00' } })
    fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: '2027-06-04T11:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add the item' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      params: { editionId: 'edition-1' },
      body: {
        title: 'Opening ceremony',
        startsAt: '2027-06-04T10:00:00.000Z',
        endsAt: '2027-06-04T11:00:00.000Z',
      },
    })
    expect(await screen.findByText('the page of the new item')).toBeDefined()
  })
})
