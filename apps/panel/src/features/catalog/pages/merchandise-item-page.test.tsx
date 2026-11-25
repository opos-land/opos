import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MerchandiseItemPage } from './merchandise-item-page'

const state = vi.hoisted(() => ({ tickets: 'none' }))
const readItems = vi.hoisted(() => vi.fn())
const readFile = vi.hoisted(() => vi.fn())
const createItem = vi.hoisted(() => vi.fn())
const updateItem = vi.hoisted(() => vi.fn())
const removeItem = vi.hoisted(() => vi.fn())
const putVariants = vi.hoisted(() => vi.fn())
const putStock = vi.hoisted(() => vi.fn())
const addPicture = vi.hoisted(() => vi.fn())
const removePicture = vi.hoisted(() => vi.fn())
const putSizeChart = vi.hoisted(() => vi.fn())
const removeSizeChart = vi.hoisted(() => vi.fn())
const notifySuccess = vi.hoisted(() => vi.fn())
const notifyFailure = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/lib/notify', () => ({ notifySuccess, notifyFailure }))
vi.mock('../../../shared/lib/file-upload', () => ({
  toUpload: (file: File) => Promise.resolve({ name: file.name, type: file.type, data: 'AAAA' }),
}))
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
  merchandiseOptions: () => ({ queryKey: ['catalog', 'merchandise'], queryFn: readItems }),
  merchandiseFileOptions: (_api: unknown, _edition: string, fileId: string) => ({
    queryKey: ['catalog', 'file', fileId],
    queryFn: readFile,
  }),
  createItemOptions: () => ({ mutationFn: createItem }),
  updateItemOptions: () => ({ mutationFn: updateItem }),
  removeItemOptions: () => ({ mutationFn: removeItem }),
  putVariantsOptions: () => ({ mutationFn: putVariants }),
  putStockOptions: () => ({ mutationFn: putStock }),
  addPictureOptions: () => ({ mutationFn: addPicture }),
  removePictureOptions: () => ({ mutationFn: removePicture }),
  putSizeChartOptions: () => ({ mutationFn: putSizeChart }),
  removeSizeChartOptions: () => ({ mutationFn: removeSizeChart }),
  catalogKey: () => ['catalog'],
}))

const value = (id: string, label: string, sizeChart: object | null = null) => ({
  id,
  label,
  sizeChart,
})
const variant = (id: string, valueIds: string[], stock: number | null = 0) => ({
  id,
  valueIds,
  stock,
  hidden: false,
})
const mug = {
  id: 'mug',
  editionId: 'edition-2026',
  name: 'Mug',
  description: 'Ceramic.',
  amountMinor: 3500,
  perOrderLimit: 4,
  picturesIllustrative: false,
  position: 1,
  hidden: false,
  axes: [],
  variants: [variant('mug-only', [], 40)],
  pictures: [],
}
const shirt = {
  ...mug,
  id: 'shirt',
  name: 'T-shirt',
  amountMinor: 8000,
  axes: [
    {
      id: 'cut',
      name: 'Cut',
      values: [
        value('w', "Women's", { fileId: 'chart-w', width: 400, height: 300 }),
        value('m', "Men's"),
      ],
    },
    { id: 'size', name: 'Size', values: [value('s', 'S'), value('l', 'L')] },
  ],
  variants: [variant('ws', ['w', 's'], 12)],
  pictures: [
    { id: 'picture-1', fileId: 'file-1', width: 800, height: 600 },
    { id: 'picture-2', fileId: 'file-2', width: 600, height: 600 },
  ],
}

const view = (path = 'new') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/convention-a/editions/2026/merchandise/${path}`]}>
          <Routes>
            <Route
              path="/:tenantSlug/editions/:editionSlug/merchandise/new"
              element={<MerchandiseItemPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/merchandise/:itemId"
              element={<MerchandiseItemPage />}
            />
            <Route
              path="/:tenantSlug/editions/:editionSlug/merchandise"
              element={<p>the list of merchandise</p>}
            />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const field = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label)
const type = (label: string | RegExp, text: string) =>
  fireEvent.change(field(label), { target: { value: text } })
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const box = (name: string) => screen.getByRole('checkbox', { name })
const confirm = async (name: string) => {
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name }))
}
const png = (name = 'shirt.png') => new File(['x'], name, { type: 'image/png' })

beforeAll(() => {
  i18n.load('en', {})
  i18n.activate('en')
  // jsdom has no copy of a file to point at.
  URL.createObjectURL = vi.fn(() => 'blob:picture')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  state.tickets = 'write'
  readItems.mockResolvedValue([mug, shirt])
  readFile.mockResolvedValue({ headers: {}, body: new Blob(['x']) })
  createItem.mockResolvedValue({ ...mug, id: 'pin', name: 'Pin' })
  for (const mock of [updateItem, removeItem, putStock, addPicture, removePicture]) {
    mock.mockResolvedValue(shirt)
  }
  for (const mock of [putSizeChart, removeSizeChart]) mock.mockResolvedValue(shirt)
  putVariants.mockResolvedValue({
    ...shirt,
    variants: [variant('ws', ['w', 's'], 12), variant('ml', ['m', 'l'], 0)],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a new merchandise item', () => {
  it('is not offered to a member who only reads the tickets', async () => {
    state.tickets = 'read'

    view()

    expect(await screen.findByRole('heading', { name: 'No permissions' })).toBeDefined()
  })

  it('is added with its fields alone, and has no field for shipping', async () => {
    view()
    await screen.findByLabelText('Name')

    expect(screen.queryByLabelText(/shipping|delivery/i)).toBeNull()
    type('Name', ' Pin ')
    type(/^Price/, '15')
    type('Most in a single order', '10')
    fireEvent.click(box('The pictures are illustrative'))
    press('Add the item')

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1))
    expect(createItem.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026' },
      body: {
        name: 'Pin',
        description: '',
        amountMinor: 1500,
        perOrderLimit: 10,
        picturesIllustrative: true,
      },
    })
  })

  it('names what is wrong beside its field, and sends nothing', async () => {
    view()
    await screen.findByLabelText('Name')

    type('Most in a single order', '0')
    press('Add the item')

    expect(await screen.findByText('Enter a name.')).toBeDefined()
    expect(screen.getByText('Enter a whole number from 1 to 100.')).toBeDefined()
    expect(createItem).not.toHaveBeenCalled()
  })
})

describe('an item that exists', () => {
  it('saves its fields, and is deleted only once the modal that names it is confirmed', async () => {
    view('mug')
    await waitFor(() => expect(field('Name').value).toBe('Mug'))
    expect(field(/^Price/).value).toBe('35.00')

    type('Name', 'Cup')
    press('Save the item')
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'mug' },
      body: {
        name: 'Cup',
        description: 'Ceramic.',
        amountMinor: 3500,
        perOrderLimit: 4,
        picturesIllustrative: false,
      },
    })

    press('Delete the item')
    expect(removeItem).not.toHaveBeenCalled()
    await confirm('Delete the item')
    await waitFor(() => expect(removeItem).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('the list of merchandise')).toBeDefined()
  })

  it('is not found under an identifier the edition does not hold', async () => {
    view('poster')

    expect(await screen.findByRole('heading', { name: /not found/i })).toBeDefined()
  })

  it('is shown to a reader with nothing to press', async () => {
    state.tickets = 'read'

    view('shirt')

    await waitFor(() => expect(field('Name').value).toBe('T-shirt'))
    expect(screen.queryByRole('button')).toBeNull()
    expect(field('Name').matches(':disabled')).toBe(true)
    expect(screen.getByText("Women's, Men's")).toBeDefined()
    expect(box("Women's · S: exists").matches('[aria-disabled="true"], :disabled')).toBe(true)
  })
})

describe('the axes of an item', () => {
  it('are saved with the identifiers they had when no variant is lost', async () => {
    view('shirt')
    await waitFor(() => expect(field('Name of axis 1').value).toBe('Cut'))

    type('Name of axis 1', 'Fit')
    press('Add a value to axis 2')
    type('Value 3 of axis 2', 'XL')
    press('Save the axes')

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(updateItem.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt' },
      body: {
        axes: [
          {
            id: 'cut',
            name: 'Fit',
            values: [
              { id: 'w', label: "Women's" },
              { id: 'm', label: "Men's" },
            ],
          },
          {
            id: 'size',
            name: 'Size',
            values: [{ id: 's', label: 'S' }, { id: 'l', label: 'L' }, { label: 'XL' }],
          },
        ],
      },
    })
  })

  it('ask in a modal before a change that takes variants away', async () => {
    view('shirt')
    await waitFor(() => expect(field('Name of axis 1').value).toBe('Cut'))

    press('Remove axis 2')
    press('Save the axes')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Save the axes and remove variants?')).toBeDefined()
    // The size chart stays with its value, so the modal does not name it.
    expect(within(dialog).getByText(/every variant of the item goes with its stock/)).toBeDefined()
    expect(within(dialog).queryByText(/size chart/)).toBeNull()
    expect(updateItem).not.toHaveBeenCalled()
    await confirm('Save the axes')
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![0]).toMatchObject({ body: { axes: [{ id: 'cut' }] } })
  })

  it('ask in a modal before saving a value whose label was cleared, which goes', async () => {
    view('shirt')
    await waitFor(() => expect(field('Value 1 of axis 2').value).toBe('S'))

    type('Value 1 of axis 2', '')
    press('Save the axes')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Save the axes and remove variants?')).toBeDefined()
    expect(within(dialog).getByText(/A value left empty is removed as well\./)).toBeDefined()
    expect(updateItem).not.toHaveBeenCalled()
    await confirm('Save the axes')
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![0]).toMatchObject({
      body: { axes: [{ id: 'cut' }, { id: 'size', values: [{ id: 'l', label: 'L' }] }] },
    })
  })

  it('name the size chart alone where the item has no variant to lose', async () => {
    readItems.mockResolvedValue([mug, { ...shirt, variants: [] }])
    view('shirt')
    await waitFor(() => expect(field('Value 1 of axis 1').value).toBe("Women's"))

    type('Value 1 of axis 1', '')
    press('Save the axes')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Save the axes and remove size charts?')).toBeDefined()
    expect(within(dialog).getByText(/A removed value takes its size chart\./)).toBeDefined()
    expect(within(dialog).getByText(/A value left empty is removed as well\./)).toBeDefined()
    expect(within(dialog).queryByText(/variant/)).toBeNull()
    expect(updateItem).not.toHaveBeenCalled()
    await confirm('Save the axes')
    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![0]).toMatchObject({
      body: { axes: [{ id: 'cut', values: [{ id: 'm', label: "Men's" }] }, { id: 'size' }] },
    })
  })

  it('name the variants and the size chart where a value takes both', async () => {
    view('shirt')
    await waitFor(() => expect(field('Value 1 of axis 1').value).toBe("Women's"))

    press('Remove value 1 of axis 1')
    press('Save the axes')

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Save the axes and remove variants and size charts?'),
    ).toBeDefined()
    expect(
      within(dialog).getByText(/takes the variants that held it, and its size chart\./),
    ).toBeDefined()
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('refuse an axis left without a name, and send nothing', async () => {
    view('shirt')
    await waitFor(() => expect(field('Name of axis 1').value).toBe('Cut'))

    type('Name of axis 1', ' ')
    press('Save the axes')

    expect(await screen.findByText(/Give every axis a name and at least one value/)).toBeDefined()
    expect(updateItem).not.toHaveBeenCalled()
  })
})

describe('the variants of an item', () => {
  it('lists every combination, ticked while it exists, with its stock', async () => {
    view('shirt')

    await waitFor(() =>
      expect(box("Women's · S: exists").getAttribute('aria-checked')).toBe('true'),
    )
    expect(field("Women's · S: stock").value).toBe('12')
    expect(box("Men's · L: exists").getAttribute('aria-checked')).toBe('false')
    expect(field("Men's · L: stock").matches(':disabled')).toBe(true)
  })

  it('saves which variants exist, then the stock of each that changed, and tells it once', async () => {
    view('shirt')
    await waitFor(() => expect(field("Women's · S: stock").value).toBe('12'))

    fireEvent.click(box("Men's · L: exists"))
    type("Men's · L: stock", '7')
    press('Save the variants and their stock')

    await waitFor(() => expect(putStock).toHaveBeenCalledTimes(1))
    expect(putVariants.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt' },
      body: {
        variants: [
          { valueIds: ['w', 's'], hidden: false },
          { valueIds: ['m', 'l'], hidden: false },
        ],
      },
    })
    // The stock of the variant that kept its number is not set again.
    expect(putStock.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt', variantId: 'ml' },
      body: { stock: 7 },
    })
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1))
  })

  it('leaves a stock the form did not change as someone else set it meanwhile', async () => {
    putVariants.mockResolvedValue({
      ...shirt,
      variants: [variant('ws', ['w', 's'], 5), variant('ml', ['m', 'l'], 0)],
    })
    view('shirt')
    await waitFor(() => expect(field("Women's · S: stock").value).toBe('12'))

    fireEvent.click(box("Men's · L: exists"))
    press('Save the variants and their stock')

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1))
    expect(putVariants).toHaveBeenCalledTimes(1)
    expect(putStock).not.toHaveBeenCalled()
  })

  it('marks a variant unlimited, which holds no number', async () => {
    view('shirt')
    await waitFor(() => expect(field("Women's · S: stock").value).toBe('12'))

    fireEvent.click(box("Women's · S: unlimited"))
    expect(field("Women's · S: stock").matches(':disabled')).toBe(true)
    press('Save the variants and their stock')

    await waitFor(() => expect(putStock).toHaveBeenCalledTimes(1))
    expect(putStock.mock.calls[0]![0]).toMatchObject({
      params: { variantId: 'ws' },
      body: { stock: null },
    })
  })

  it('refuses a stock that is no whole number, and sends nothing', async () => {
    view('shirt')
    await waitFor(() => expect(field("Women's · S: stock").value).toBe('12'))

    type("Women's · S: stock", 'a few')
    press('Save the variants and their stock')

    expect(await screen.findByText(/Enter the stock of every variant that exists/)).toBeDefined()
    expect(putVariants).not.toHaveBeenCalled()
    expect(putStock).not.toHaveBeenCalled()
  })

  it('of an item without axes are the item itself: only its stock is set', async () => {
    view('mug')
    await waitFor(() => expect(field('The item itself: stock').value).toBe('40'))

    expect(screen.queryByRole('checkbox', { name: /exists/ })).toBeNull()
    type('The item itself: stock', '55')
    press('Save the variants and their stock')

    await waitFor(() => expect(putStock).toHaveBeenCalledTimes(1))
    expect(putVariants).not.toHaveBeenCalled()
    expect(putStock.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'mug', variantId: 'mug-only' },
      body: { stock: 55 },
    })
  })
})

describe('the pictures of an item', () => {
  it('are shown in their order, each named for assistive technology', async () => {
    view('shirt')

    expect(await screen.findByRole('img', { name: 'Picture 1 of T-shirt' })).toBeDefined()
    expect(screen.getByRole('img', { name: 'Picture 2 of T-shirt' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Move picture 1 up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move picture 2 down' })).toBeNull()
  })

  it('are put in another order as a whole list', async () => {
    view('shirt')

    fireEvent.click(await screen.findByRole('button', { name: 'Move picture 2 up' }))

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1))
    expect(updateItem.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt' },
      body: { pictureIds: ['picture-2', 'picture-1'] },
    })
  })

  it('are added from an image, and a file of another type is told beside the field', async () => {
    view('shirt')
    const chooser = await screen.findByLabelText<HTMLInputElement>('New picture')

    fireEvent.change(chooser, {
      target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] },
    })
    expect(await screen.findByText('Choose a JPEG, PNG or WebP image.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add the picture' }).matches(':disabled')).toBe(true)

    fireEvent.change(chooser, { target: { files: [png()] } })
    press('Add the picture')

    await waitFor(() => expect(addPicture).toHaveBeenCalledTimes(1))
    expect(addPicture.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt' },
      body: { file: { name: 'shirt.png', type: 'image/png', data: 'AAAA' } },
    })
  })

  it('are added once, however often the button is pressed while the image is read', async () => {
    view('shirt')
    const chooser = await screen.findByLabelText<HTMLInputElement>('New picture')
    fireEvent.change(chooser, { target: { files: [png()] } })

    press('Add the picture')
    press('Add the picture')

    await waitFor(() => expect(addPicture).toHaveBeenCalled())
    await waitFor(() => expect(notifyFailure).not.toHaveBeenCalled())
    expect(addPicture).toHaveBeenCalledTimes(1)
  })

  it('are removed only once the modal is confirmed', async () => {
    view('shirt')

    fireEvent.click(await screen.findByRole('button', { name: 'Remove picture 1' }))
    expect(removePicture).not.toHaveBeenCalled()
    await confirm('Remove the picture')

    await waitFor(() => expect(removePicture).toHaveBeenCalledTimes(1))
    expect(removePicture.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt', pictureId: 'picture-1' },
    })
  })
})

describe('the size charts of an item', () => {
  it('show the chart a value has, and say where a value has none', async () => {
    view('shirt')

    expect(await screen.findByRole('img', { name: "Size chart of Cut: Women's" })).toBeDefined()
    const mens = within(screen.getByRole('region', { name: "Cut: Men's" }))
    expect(mens.getByText('No size chart.')).toBeDefined()
    expect(mens.queryByRole('button', { name: 'Remove the size chart' })).toBeNull()
  })

  it('are set from an image for the value they belong to', async () => {
    view('shirt')
    const mens = within(await screen.findByRole('region', { name: "Cut: Men's" }))

    fireEvent.change(mens.getByLabelText("New size chart of Cut: Men's"), {
      target: { files: [png('chart.png')] },
    })
    fireEvent.click(mens.getByRole('button', { name: 'Set the size chart' }))

    await waitFor(() => expect(putSizeChart).toHaveBeenCalledTimes(1))
    expect(putSizeChart.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt', valueId: 'm' },
      body: { file: { name: 'chart.png', type: 'image/png', data: 'AAAA' } },
    })
  })

  it('leave what the other editors hold unsaved when one is set', async () => {
    view('shirt')
    await waitFor(() => expect(field("Women's · S: stock").value).toBe('12'))
    type("Women's · S: stock", '99')
    press('Add a value to axis 2')
    type('Value 3 of axis 2', 'XL')
    readItems.mockResolvedValue([
      mug,
      {
        ...shirt,
        axes: [
          {
            ...shirt.axes[0]!,
            values: [
              shirt.axes[0]!.values[0]!,
              value('m', "Men's", { fileId: 'chart-m', width: 400, height: 300 }),
            ],
          },
          shirt.axes[1]!,
        ],
      },
    ])

    const mens = within(screen.getByRole('region', { name: "Cut: Men's" }))
    fireEvent.change(mens.getByLabelText("New size chart of Cut: Men's"), {
      target: { files: [png('chart.png')] },
    })
    fireEvent.click(mens.getByRole('button', { name: 'Set the size chart' }))

    expect(await screen.findByRole('img', { name: "Size chart of Cut: Men's" })).toBeDefined()
    expect(field("Women's · S: stock").value).toBe('99')
    expect(field('Value 3 of axis 2').value).toBe('XL')
  })

  it('are removed only once the modal is confirmed', async () => {
    view('shirt')
    const womens = within(await screen.findByRole('region', { name: "Cut: Women's" }))

    fireEvent.click(womens.getByRole('button', { name: 'Remove the size chart' }))
    expect(removeSizeChart).not.toHaveBeenCalled()
    await confirm('Remove the size chart')

    await waitFor(() => expect(removeSizeChart).toHaveBeenCalledTimes(1))
    expect(removeSizeChart.mock.calls[0]![0]).toEqual({
      params: { editionId: 'edition-2026', itemId: 'shirt', valueId: 'w' },
    })
  })

  it('are none for an item without axes', async () => {
    view('mug')

    expect(await screen.findByText('An item without option axes has no size chart.')).toBeDefined()
  })
})
