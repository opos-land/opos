// DRAFT, PENDING LEGAL REVIEW. These terms are a working draft written from
// docs/specs/0016-public-profile.md and have not been reviewed by a lawyer. Before the production
// launch a legal review must approve the text in both languages and add what a draft cannot
// state: who runs OPOS, the real contact address and what else the law asks of such terms.

import { Trans, useLingui } from '@lingui/react/macro'
import { CONTACT_EMAIL } from '@opos/contract'
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { PRIVACY_PATH } from '../../../shared/config/routes'
import { usePageTitle } from '../../../shared/lib/page-title'
import { linkClass, Page } from '../../../shared/ui'

function Part({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Points({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>
}

/**
 * The platform's terms (docs/specs/0016-public-profile.md, M1-M5), linked from the registration
 * form, from where a profile is published and from the footer: who may have an account, what a
 * name and a profile may not hold, how a profile is reported, what an administrator may do about
 * it and how a decision is contested.
 */
export function TermsPage() {
  const { t } = useLingui()
  usePageTitle(t`Terms`)
  return (
    <Page
      title={<Trans>Terms</Trans>}
      lead={<Trans>The rules of using OPOS. By creating an account you accept them.</Trans>}
    >
      <Part title={<Trans>Your account</Trans>}>
        <p>
          <Trans>
            An account is for a person who is 16 or older. A younger attendee needs no account: a
            ticket names its holder, whoever ordered it.
          </Trans>
        </p>
        <p>
          <Trans>
            How OPOS handles your personal data is in the{' '}
            <Link to={PRIVACY_PATH} className={linkClass}>
              privacy policy
            </Link>
            .
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>Your name, your avatar and your profile</Trans>}>
        <p>
          <Trans>
            Your name is shown wherever your account is named to everyone, and your avatar is public
            from the moment you upload it. Your profile is private until you publish it. What you
            show there is yours to choose, within these rules:
          </Trans>
        </p>
        <Points>
          <li>
            <Trans>
              A profile and a name are your own. They hold no picture, name or identity of someone
              else.
            </Trans>
          </li>
          <li>
            <Trans>Nothing offensive, hateful or unlawful.</Trans>
          </li>
          <li>
            <Trans>No spam and no advertising.</Trans>
          </li>
          <li>
            <Trans>
              An avatar is a picture you have the right to show: of yourself, or one whose rights
              are yours.
            </Trans>
          </li>
        </Points>
      </Part>

      <Part title={<Trans>Reports</Trans>}>
        <p>
          <Trans>
            Anyone may report a published profile, from its page. The administrators of OPOS read
            every report and decide whether the profile stays.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>What the administrators may do</Trans>}>
        <Points>
          <li>
            <Trans>
              They may take a profile down: it stops being public, its avatar is removed and it
              cannot be published until they restore it.
            </Trans>
          </li>
          <li>
            <Trans>
              They may clear the name of an account. You may enter a name again that keeps these
              rules.
            </Trans>
          </li>
          <li>
            <Trans>They change nothing else of what a profile says.</Trans>
          </li>
        </Points>
        <p>
          <Trans>
            Each time they write to you by email: what was done, which rule of these terms it rests
            on and how to contest it. A person decides, never a program.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>If you do not agree with a decision</Trans>}>
        <p>
          <Trans>
            Change your profile and ask for a review on its page, or write to {CONTACT_EMAIL} and
            say why.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>Contact</Trans>}>
        <p>
          <Trans>Write to the people who run OPOS at {CONTACT_EMAIL}.</Trans>
        </p>
      </Part>
    </Page>
  )
}
