import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { toast, Toaster } from './toast'

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

describe('Toaster', () => {
  it('shows a notification added from outside React, with a way to close it', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <Toaster />
      </I18nProvider>,
    )

    act(() => {
      toast.add({ type: 'success', title: 'The changes are saved.' })
    })

    const region = await screen.findByRole('region', { name: 'Notifications' })
    const notification = within(region).getByRole('dialog', { name: 'The changes are saved.' })
    // Base UI hides the close button from assistive technology until the notification is focused.
    const close = within(notification).getByLabelText('Close')
    expect(close).toBeDefined()
  })
})
