import { Trans, useLingui } from '@lingui/react/macro'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { PRIVACY_PATH } from '../../../shared/config/routes'
import { Button, linkClass } from '../../../shared/ui'
import { decideConsent, followConsent, offeredCategories, useConsentChoice } from '../model/consent'
import { CATEGORY_TEXTS, type ConsentCategory } from '../model/tracker'
import { TRACKERS } from '../trackers'
import { ConsentSettings } from './consent-settings'

/**
 * Asks the visitor, on every screen until answered, for the listed trackers, and starts what was
 * allowed. Refusing is as prominent as allowing, and the portal works the same either way, so it
 * covers nothing that needs it. With no tracker listed it shows nothing.
 */
export function ConsentBanner() {
  const { i18n } = useLingui()
  const headingId = useId()
  const choice = useConsentChoice()
  const [choosing, setChoosing] = useState(false)
  useEffect(followConsent, [])

  if (TRACKERS.length === 0) return null

  const categories = offeredCategories()
  const vendors = (category: ConsentCategory) =>
    new Intl.ListFormat(i18n.locale, { type: 'conjunction' }).format(
      new Set(
        TRACKERS.filter((tracker) => tracker.category === category).map(
          (tracker) => tracker.vendor,
        ),
      ),
    )

  return (
    <>
      {choice === null && (
        <section
          aria-labelledby={headingId}
          className="bg-background fixed inset-x-0 bottom-0 z-40 border-t shadow-lg"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-4 text-sm">
            <h2 id={headingId} className="text-base font-semibold">
              <Trans>Optional tools</Trans>
            </h2>
            <p>
              <Trans>OPOS works without them. With your consent, it would also use:</Trans>
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {categories.map((category) => {
                const label = i18n._(CATEGORY_TEXTS[category].label)
                const providers = vendors(category)
                return (
                  <li key={category}>
                    <Trans comment="A category of optional tools, then the providers of its tools joined into a list">
                      <span className="font-medium">{label}:</span> <span>{providers}</span>
                    </Trans>
                  </li>
                )
              })}
            </ul>
            <p className="text-muted-foreground">
              <Trans>
                None of them runs until you allow it. You can change your choice at any time in the
                privacy settings at the bottom of the page.
              </Trans>{' '}
              <Link to={PRIVACY_PATH} className={linkClass}>
                <Trans>Privacy policy</Trans>
              </Link>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => decideConsent(categories)}>
                <Trans>Allow all</Trans>
              </Button>
              <Button variant="outline" onClick={() => decideConsent([])}>
                <Trans>Refuse all</Trans>
              </Button>
              <Button variant="ghost" onClick={() => setChoosing(true)}>
                <Trans>Customize</Trans>
              </Button>
            </div>
          </div>
        </section>
      )}
      <ConsentSettings open={choosing} onOpenChange={setChoosing} />
    </>
  )
}
