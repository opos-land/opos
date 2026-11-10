import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type ProgramItem } from '@opos/contract'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgramItemPage } from './program-item-page'

const list = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
const level = vi.hoisted(() => ({ program: 'none' }))

vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    edition: { id: 'edition-1', name: 'Edition 2027', slug: '2027' },
    isPending: false,
    isError: false,
    error: null,
  }),
}))
vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: { edition: () => level },
    api: {},
  }),
  useTenantTime: () => ({
    timeZone: 'Europe/Warsaw',
    range: () => 'the time of the item',
    toInput: (iso: string) => iso.slice(0, 16),
    fromInput: () => null,
  }),
}))
vi.mock('../api/program', () => ({
  programItemsOptions: () => ({ queryKey: ['program'], queryFn: list }),
  programKey: () => ['program'],
  updateProgramItemOptions: () => ({ mutationFn: vi.fn() }),
  removeProgramItemOptions: () => ({ mutationFn: remove }),
  putSpeakersOptions: () => ({ mutationFn: vi.fn() }),
}))

const item: ProgramItem = {
  id: 'item-1',
  editionId: 'edition-1',
  title: 'A panel on maps',
  description: null,
  startsAt: '2027-05-01T08:00:00.000Z',
  endsAt: '2027-05-01T09:00:00.000Z',
  speakers: [],
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/convention-a/editions/2027/program/item-1']}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/program"
              element={<p>The programme</p>}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/program/:programItemId"
              element={<ProgramItemPage />}
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
  level.program = 'write'
  list.mockReset()
  list.mockResolvedValue([item])
  remove.mockReset()
  remove.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('ProgramItemPage', () => {
  it('offers no deletion below program=write', async () => {
    level.program = 'read'
    view()

    expect(await screen.findByRole('heading', { name: 'A panel on maps', level: 1 })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('deletes the item once its modal is confirmed, then returns to the programme', async () => {
    const user = userEvent.setup()
    view()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete the programme item A panel on maps?',
    })
    expect(dialog.textContent).toContain('speakers')
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(remove).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete the programme item' }))

    expect(await screen.findByText('The programme')).toBeDefined()
    expect(remove.mock.calls[0]?.[0]).toEqual({
      params: { editionId: 'edition-1', programItemId: 'item-1' },
    })
  })
})
