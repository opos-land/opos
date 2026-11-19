import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandingPage } from './branding-page'

const state = vi.hoisted(() => ({ branding: 'none' }))
const read = vi.hoisted(() => vi.fn())
const put = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
const notifyFailure = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/lib/notify', () => ({ notifyFailure }))

vi.mock('../../tenants', () => ({
  atLeast: (held: string, needed: string) =>
    ['none', 'read', 'write'].indexOf(held) >= ['none', 'read', 'write'].indexOf(needed),
  useCurrentTenant: () => ({
    tenant: { slug: 'convention-a', name: 'Convention A' },
    access: { branding: state.branding },
    api: {},
  }),
}))
vi.mock('../api/branding', () => ({
  brandingOptions: () => ({ queryKey: ['branding'], queryFn: read }),
  putLogoOptions: () => ({ mutationFn: put }),
  removeLogoOptions: () => ({ mutationFn: remove }),
}))

const logo = { fileId: '0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60', width: 400, height: 200 }

const picture = (type = 'image/png', bytes = 5, name = 'logo.png') =>
  new File([new Uint8Array(bytes)], name, { type })

const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <BrandingPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )

const choose = (label: string, file: File) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  state.branding = 'none'
  read.mockReset().mockResolvedValue({ logo: null })
  put.mockReset().mockResolvedValue({ logo })
  remove.mockReset().mockResolvedValue(undefined)
  notifyFailure.mockReset()
})

afterEach(cleanup)

describe('BrandingPage', () => {
  it('is closed to a member without the branding, and asks the API nothing', () => {
    view()

    expect(screen.getByRole('heading', { name: 'No permissions' })).toBeDefined()
    expect(read).not.toHaveBeenCalled()
  })

  it('says that the convention has no logo, and offers to upload one', async () => {
    state.branding = 'write'
    view()

    expect(await screen.findByText('The convention has no logo.')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Branding', level: 1 })).toBeDefined()
    expect(document.title).toBe('Branding · Convention A · OPOS panel')
    expect(screen.getByLabelText('Logo file')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Upload the logo' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the logo to a member who reads the branding, with nothing to change it', async () => {
    state.branding = 'read'
    read.mockResolvedValue({ logo })
    view()

    const image = await screen.findByRole('img', { name: 'The logo of Convention A' })
    expect(image.getAttribute('src')).toMatch(
      /\/public\/tenants\/convention-a\/logo-files\/0e0d8f7e-8a3c-4b5e-9f60-1b2c3d4e5f60\/large$/,
    )
    expect(image.getAttribute('width')).toBe('160')
    expect(image.getAttribute('height')).toBe('80')
    expect(screen.queryByLabelText('Logo file')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uploads the chosen image and shows it', async () => {
    state.branding = 'write'
    view()
    await screen.findByText('The convention has no logo.')

    choose('Logo file', picture())
    fireEvent.click(screen.getByRole('button', { name: 'Upload the logo' }))

    expect(await screen.findByRole('img', { name: 'The logo of Convention A' })).toBeDefined()
    expect(put.mock.calls[0]?.[0]).toEqual({
      body: {
        file: {
          name: 'logo.png',
          type: 'image/png',
          data: Buffer.from(new Uint8Array(5)).toString('base64'),
        },
      },
    })
  })

  it.each([
    [
      'a file that is no JPEG, PNG or WebP',
      picture('image/svg+xml'),
      'Choose a JPEG, PNG or WebP image.',
    ],
    [
      'an image over 2 MB',
      picture('image/png', 2 * 1024 * 1024 + 1),
      'Choose an image of up to 2 MB.',
    ],
  ])('refuses %s beside the field, and sends nothing', async (_, file, message) => {
    state.branding = 'write'
    view()
    await screen.findByText('The convention has no logo.')

    choose('Logo file', file)

    expect(screen.getByText(message)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Upload the logo' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(put).not.toHaveBeenCalled()
  })

  it('tells a file that cannot be read as a failure, and sends nothing', async () => {
    state.branding = 'write'
    const reading = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
      this: FileReader,
    ) {
      this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
    })
    try {
      view()
      await screen.findByText('The convention has no logo.')

      choose('Logo file', picture())
      fireEvent.click(screen.getByRole('button', { name: 'Upload the logo' }))

      await vi.waitFor(() => expect(notifyFailure).toHaveBeenCalledTimes(1))
      expect(put).not.toHaveBeenCalled()
    } finally {
      reading.mockRestore()
    }
  })

  it('asks in a modal before a new logo takes the place of the one shown', async () => {
    state.branding = 'write'
    read.mockResolvedValue({ logo })
    const next = { ...logo, fileId: '7c1f6c0e-5d1b-4a0e-8f43-2d1e9b7a6c55' }
    put.mockResolvedValue({ logo: next })
    view()
    await screen.findByRole('img', { name: 'The logo of Convention A' })

    choose('Logo file', picture())
    fireEvent.click(screen.getByRole('button', { name: 'Replace the logo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Replace the logo of Convention A?' })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(put).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace the logo' }))

    await vi.waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'The logo of Convention A' }).getAttribute('src'),
      ).toContain(next.fileId),
    )
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('removes the logo once its modal is confirmed', async () => {
    state.branding = 'write'
    read.mockResolvedValue({ logo })
    view()
    await screen.findByRole('img', { name: 'The logo of Convention A' })

    fireEvent.click(screen.getByRole('button', { name: 'Remove the logo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove the logo of Convention A?' })
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the logo' }))

    expect(await screen.findByText('The convention has no logo.')).toBeDefined()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
