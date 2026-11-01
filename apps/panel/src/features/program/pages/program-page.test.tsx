import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type ProgramItem } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditionBySlug } from '../../editions'
import { ProgramPage } from './program-page'

const list = vi.hoisted(() => vi.fn())
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
    range: () => 'the time of the item',
    fromInput: () => null,
  }),
}))
vi.mock('../api/program', () => ({
  programItemsOptions: () => ({ queryKey: ['program'], queryFn: list }),
  programKey: () => ['program'],
  createProgramItemOptions: () => ({ mutationFn: vi.fn() }),
}))

const panel: ProgramItem = {
  id: 'item-1',
  editionId: 'edition-1',
  title: 'A panel on maps',
  description: null,
  startsAt: '2027-05-01T08:00:00.000Z',
  endsAt: '2027-05-01T09:00:00.000Z',
  speakers: [{ id: 'a', email: 'a@x.test', firstName: 'Kasia', lastName: 'Mazur' }],
}

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
        <MemoryRouter initialEntries={['/convention-a/editions/2027/program']}>
          <Routes>
            <Route path="/:tenantSlug/editions/:editionSlug/program" element={<ProgramPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const NO_PERMISSION = /permissions/i

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue([panel])
  setEdition({ id: 'edition-1', name: 'Edition 2027', slug: '2027' })
})

afterEach(cleanup)

describe('ProgramPage', () => {
  it('shows no programme and asks nothing of the API without program access', () => {
    level.program = 'none'
    view()

    expect(screen.getByRole('heading', { name: NO_PERMISSION })).toBeDefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('treats an edition the member does not see like one without access', () => {
    level.program = 'read'
    setEdition(undefined)
    view()

    expect(screen.getByRole('heading', { name: NO_PERMISSION })).toBeDefined()
    expect(list).not.toHaveBeenCalled()
  })

  it('lists the items with their speakers, with no form, for a reader', async () => {
    level.program = 'read'
    view()

    const link = await screen.findByRole('link', { name: 'A panel on maps' })
    expect(link.getAttribute('href')).toBe('/convention-a/editions/2027/program/item-1')
    expect(screen.getByText('Kasia Mazur')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Add the item' })).toBeNull()
  })

  it('offers the form to a member with program=write', async () => {
    level.program = 'write'
    view()

    expect(await screen.findByRole('button', { name: 'Add the item' })).toBeDefined()
  })

  it('says when the edition has no items', async () => {
    level.program = 'read'
    list.mockResolvedValue([])
    view()

    expect(await screen.findByText('There are no programme items yet.')).toBeDefined()
  })
})
