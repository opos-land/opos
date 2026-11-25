import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddOnPage } from './add-on-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readAddOns = vi.hoisted(() => vi.fn())
const createAddOn = vi.hoisted(() => vi.fn())
const updateAddOn = vi.hoisted(() => vi.fn())
const removeAddOn = vi.hoisted(() => vi.fn())
const putPicture = vi.hoisted(() => vi.fn())
const removePicture = vi.hoisted(() => vi.fn())
const readFile = vi.hoisted(() => vi.fn())

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: {
      edition: () => ({ program: 'none', websiteContent: 'none', tickets: state.tickets }),
    },
    api: {},
  }),
}))
vi.mock('../../editions', () => ({
  useEditionBySlug: () => ({
    isPending: false,
    isError: false,
    error: null,
    edition: { id: 'edition-2026', slug: '2026', name: 'Edition 2026' },
  }),
}))
vi.mock('../api/catalog', () => ({
  addOnsOptions: () => ({ queryKey: ['catalog', 'add-ons'], queryFn: readAddOns }),
  createAddOnOptions: () => ({ mutationFn: createAddOn }),
  updateAddOnOptions: () => ({ mutationFn: updateAddOn }),
  removeAddOnOptions: () => ({ mutationFn: removeAddOn }),
  putAddOnPictureOptions: () => ({ mutationFn: putPicture }),
  removeAddOnPictureOptions: () => ({ mutationFn: removePicture }),
  addOnFileOptions: (_api: unknown, _edition: string, fileId: string) => ({
    queryKey: ['catalog', 'add-on-file', fileId],
    queryFn: readFile,
  }),
  catalogKey: () => ['catalog'],
}))
vi.mock('../../../shared/lib/file-upload', () => ({
  toUpload: (file: File) => Promise.resolve({ name: file.name, type: file.type, data: 'AAAA' }),
}))

const addOn = (position: number, fields: object = {}) => ({
  id: `add-on-${position}`,
  editionId: 'edition-2026',
  name: `Add-on ${position}`,
  description: '',
  amountMinor: 0,
  kind: 'unlimited',
  capacity: null,
  placesLeftThreshold: null,
  position,
  hidden: false,
  picture: null,
  ...fields,
})

const view = (id = 'add-on-1') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/add-ons/${id}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/add-ons/:addOnId"
              element={<AddOnPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/add-ons"
              element={<p>the list of add-ons</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)

const PICTURE = { fileId: 'file-room', width: 800, height: 600 }
const png = (name = 'room.png') => new File(['x'], name, { type: 'image/png' })

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
  // jsdom has no copy of a file to point at.
  URL.createObjectURL = vi.fn(() => 'blob:picture')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  state.tickets = 'write'
  readAddOns.mockResolvedValue([])
  for (const mock of [createAddOn, updateAddOn, removeAddOn]) mock.mockResolvedValue({})
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the page of an add-on', () => {
  it('is closed to a member who only reads the tickets of the edition', async () => {
    state.tickets = 'read'
    readAddOns.mockResolvedValue([addOn(1)])

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('names itself after the add-on and links back to the add-ons', async () => {
    readAddOns.mockResolvedValue([addOn(1, { name: 'Workshop' })])
    view()

    expect(await screen.findByRole('heading', { name: 'Workshop', level: 1 })).toBeDefined()
    expect(screen.getByRole('link', { name: 'All add-ons' }).getAttribute('href')).toBe(
      '/convention-a/editions/2026/add-ons',
    )
  })

  it('says so when the edition holds no such add-on', async () => {
    readAddOns.mockResolvedValue([addOn(1)])
    view('add-on-9')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('changes the add-on, the form filled with what it holds', async () => {
    readAddOns.mockResolvedValue([
      addOn(1, { name: 'Workshop', amountMinor: 4000, kind: 'limited', capacity: 30 }),
    ])
    view()

    expect((await screen.findByLabelText<HTMLInputElement>('Name')).value).toBe('Workshop')
    expect(field(/^Price/).value).toBe('40.00')
    expect(field('Number of places').value).toBe('30')
    fireEvent.change(field('Limit'), { target: { value: 'unlimited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the add-on' }))

    await waitFor(() => expect(updateAddOn).toHaveBeenCalledTimes(1))
    expect(updateAddOn.mock.calls[0]![0]).toMatchObject({
      params: { addOnId: 'add-on-1' },
      body: { name: 'Workshop', amountMinor: 4000, kind: 'unlimited', capacity: null },
    })
  })

  it('deletes an add-on only once the modal that names it is confirmed', async () => {
    readAddOns.mockResolvedValue([addOn(1, { name: 'Workshop' })])
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete the add-on' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete the add-on “Workshop”?')).toBeDefined()
    expect(removeAddOn).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete the add-on' }))

    await waitFor(() => expect(removeAddOn).toHaveBeenCalledTimes(1))
    expect(removeAddOn.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', addOnId: 'add-on-1' },
    })
    // Nothing is left to show of it: the member is led back to the add-ons.
    expect(await screen.findByText('the list of add-ons')).toBeDefined()
  })

  // docs/specs/0003-catalog.md, A4: one picture an add-on.
  describe('its picture', () => {
    const section = async () => within(await screen.findByRole('region', { name: 'Picture' }))

    it('says so while the add-on has none, and offers to set one', async () => {
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room' })])
      view()

      const picture = await section()
      expect(picture.getByText('The add-on has no picture.')).toBeDefined()
      expect(picture.getByRole('button', { name: 'Set the picture' })).toBeDefined()
      expect(picture.queryByRole('button', { name: 'Remove the picture' })).toBeNull()
    })

    it('is set from an image', async () => {
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room' })])
      putPicture.mockResolvedValue({})
      view()
      const picture = await section()

      fireEvent.change(picture.getByLabelText('New picture'), { target: { files: [png()] } })
      fireEvent.click(picture.getByRole('button', { name: 'Set the picture' }))

      await waitFor(() => expect(putPicture).toHaveBeenCalledTimes(1))
      expect(putPicture.mock.calls[0]![0]).toEqual({
        params: { editionId: 'edition-2026', addOnId: 'add-on-1' },
        body: { file: { name: 'room.png', type: 'image/png', data: 'AAAA' } },
      })
    })

    it('leaves what the form of the add-on holds unsaved when it is set', async () => {
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room' })])
      readFile.mockResolvedValue({ headers: {}, body: new Blob(['x']) })
      putPicture.mockResolvedValue({})
      view()
      const picture = await section()
      fireEvent.change(field('Name'), { target: { value: 'Sleeping hall' } })
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room', picture: PICTURE })])

      fireEvent.change(picture.getByLabelText('New picture'), { target: { files: [png()] } })
      fireEvent.click(picture.getByRole('button', { name: 'Set the picture' }))

      expect(await picture.findByRole('img', { name: 'Picture of Sleeping room' })).toBeDefined()
      expect(field('Name').value).toBe('Sleeping hall')
    })

    it('is shown once it is there, and replaced by another image', async () => {
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room', picture: PICTURE })])
      readFile.mockResolvedValue({ headers: {}, body: new Blob(['x']) })
      view()
      const picture = await section()

      // Its place is held until the file is read, then the image is the browser's own copy of it.
      await waitFor(() =>
        expect(
          picture.getByRole('img', { name: 'Picture of Sleeping room' }).getAttribute('src'),
        ).toBe('blob:picture'),
      )
      expect(picture.getByRole('button', { name: 'Replace the picture' })).toBeDefined()
      expect(picture.queryByText('The add-on has no picture.')).toBeNull()
    })

    it('is removed only once the modal is confirmed', async () => {
      readAddOns.mockResolvedValue([addOn(1, { name: 'Sleeping room', picture: PICTURE })])
      readFile.mockResolvedValue({ headers: {}, body: new Blob(['x']) })
      removePicture.mockResolvedValue({})
      view()
      const picture = await section()

      fireEvent.click(picture.getByRole('button', { name: 'Remove the picture' }))
      expect(removePicture).not.toHaveBeenCalled()
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText('Remove the picture of Sleeping room?')).toBeDefined()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the picture' }))

      await waitFor(() => expect(removePicture).toHaveBeenCalledTimes(1))
      expect(removePicture.mock.calls[0]![0]).toEqual({
        params: { editionId: 'edition-2026', addOnId: 'add-on-1' },
      })
    })
  })
})
