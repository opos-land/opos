import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { IrreversibleAction } from './irreversible-action'

const view = (onConfirm: () => Promise<unknown>) => {
  render(
    <I18nProvider i18n={i18n}>
      <IrreversibleAction
        label="Delete"
        title="Delete the edition Edition 2026?"
        action="Delete the edition"
        onConfirm={onConfirm}
      >
        Its programme items go with it.
      </IrreversibleAction>
    </I18nProvider>,
  )
  return userEvent.setup()
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('IrreversibleAction', () => {
  it('asks in a modal, saying what happens and that it cannot be undone, before acting', async () => {
    const onConfirm = vi.fn(() => Promise.resolve())
    const user = view(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete the edition Edition 2026?' })
    expect(dialog.textContent).toContain('Its programme items go with it.')
    expect(dialog.textContent).toContain('This action cannot be undone.')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does nothing when cancelled', async () => {
    const onConfirm = vi.fn(() => Promise.resolve())
    const user = view(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('acts once confirmed, holds the modal while it runs and closes it after', async () => {
    let finish = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const user = view(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete the edition' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(
      within(dialog).getByRole('button', { name: 'Delete the edition' }).hasAttribute('disabled'),
    ).toBe(true)
    finish()
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('closes the modal after a failure too, which its notification tells', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('refused')))
    const user = view(onConfirm)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete the edition' }),
    )

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
  })
})
