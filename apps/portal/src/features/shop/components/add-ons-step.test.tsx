import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { type Offer } from '@opos/contract'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../../../shared/config/env'
import { emptyDraft } from '../model/checkout'
import { ids, offer } from '../pages/offer.fixture'
import { AddOnsStep } from './add-ons-step'

const FILE = '0198c1a0-0000-7000-8000-000000000009'

/** The add-ons step of the standard ticket type, whose add-ons are the fixture's two. */
const view = (addOns: (addOn: Offer['addOns'][number]) => Offer['addOns'][number]) =>
  render(
    <I18nProvider i18n={i18n}>
      <AddOnsStep
        tenantSlug="convention-a"
        offer={offer({ addOns: offer().addOns.map(addOns) })}
        draft={emptyDraft(ids.standard)}
        ranOut={null}
        change={() => undefined}
      />
    </I18nProvider>,
  )

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

afterEach(cleanup)

// docs/specs/0003-catalog.md, A4: an add-on may have one picture, shown with it in the shop.
describe('AddOnsStep', () => {
  it('shows the picture of an add-on that has one, small, from the address anyone reads', () => {
    view((addOn) =>
      addOn.id === ids.workshop
        ? { ...addOn, picture: { fileId: FILE, width: 800, height: 600 } }
        : addOn,
    )

    const picture = screen.getByRole('img', { name: 'Painting workshop' })
    expect(picture.getAttribute('src')).toBe(
      `${env.VITE_API_URL.replace(/\/+$/, '')}/public/tenants/convention-a/add-on-files/${FILE}/small`,
    )
    // The box keeps the proportions of the picture, so the page does not jump as it loads.
    expect([picture.getAttribute('width'), picture.getAttribute('height')]).toEqual(['160', '120'])
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('shows no picture for an add-on without one', () => {
    view((addOn) => addOn)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Painting workshop/ })).toBeDefined()
  })
})
