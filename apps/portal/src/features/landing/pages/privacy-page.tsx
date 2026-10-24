// DRAFT, PENDING LEGAL REVIEW. This privacy policy is a working draft written from PRODUCT.md 10
// and has not been reviewed by a lawyer. Before the production launch a legal review must approve
// the text in both languages and add what a draft cannot state: the data controller's name and
// contact address, the legal basis of each purpose and the list of processors.

import { Trans } from '@lingui/react/macro'
import { type ReactNode } from 'react'
import { Page } from '../../../shared/ui'

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

/** The privacy policy (PRODUCT.md 10), linked from the registration form and the footer. */
export function PrivacyPage() {
  return (
    <Page
      title={<Trans>Privacy policy</Trans>}
      lead={<Trans>How OPOS handles your personal data.</Trans>}
    >
      <Part title={<Trans>What we store</Trans>}>
        <Points>
          <li>
            <Trans>
              Your account: your first name, last name, email address and the interface language you
              choose.
            </Trans>
          </li>
          <li>
            <Trans>
              What you do on the platform: the editions you sign up for, the programme items you
              like and the reviews you write.
            </Trans>
          </li>
          <li>
            <Trans>
              When you buy tickets: the email address, first name and last name given with the
              order, and the tickets in it. Payment details stay with the convention’s payment
              provider; OPOS keeps only the provider’s reference of the payment.
            </Trans>
          </li>
          <li>
            <Trans>
              When you help organize a convention: your membership in its team and your permissions.
            </Trans>
          </li>
        </Points>
      </Part>

      <Part title={<Trans>Why we store it</Trans>}>
        <p>
          <Trans>
            To run your account and sign you in; to let conventions sell you tickets, send them to
            you and check them at the venue; to keep your edition sign-ups, your personal schedule
            and your reviews; and to send the emails your account needs: address confirmation,
            password reset, tickets and invitations to a convention’s team.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>Who sees it</Trans>}>
        <Points>
          <li>
            <Trans>
              A convention sees the sign-ups for its editions and the orders placed for them.
              Conventions are isolated from each other: none of them sees another one’s data.
            </Trans>
          </li>
          <li>
            <Trans>
              The number of likes of a programme item is public. Who liked it is never shown to
              anyone.
            </Trans>
          </li>
          <li>
            <Trans>
              A review shows your name, or “anonymous” if you choose so; anonymity holds towards
              everyone, organizers included. Its comment is public or visible only to the speakers
              of the programme item, as you choose.
            </Trans>
          </li>
          <li>
            <Trans>
              If you sign in with Google, Google confirms your email address and gives us your name.
            </Trans>
          </li>
          <li>
            <Trans>
              Emails leave the platform for the mail provider only over an encrypted connection.
            </Trans>
          </li>
        </Points>
      </Part>

      <Part title={<Trans>How long we keep it</Trans>}>
        <Points>
          <li>
            <Trans>
              Your account and what you did on the platform: until you delete the account.
            </Trans>
          </li>
          <li>
            <Trans>
              Orders are the conventions’ sales records: they stay after the account with the same
              address is deleted.
            </Trans>
          </li>
          <li>
            <Trans>
              An invitation to a convention’s team stores nothing until it is accepted: the invited
              address travels only in the link sent to it.
            </Trans>
          </li>
          <li>
            <Trans>
              Database backups contain personal data. They are encrypted and kept under the same
              rules as the data itself.
            </Trans>
          </li>
        </Points>
      </Part>

      <Part title={<Trans>Deleting your account</Trans>}>
        <p>
          <Trans>
            You delete your account yourself in the account settings, after confirming it is you:
            with your password or with Google, again. Your sign-in methods, sessions, likes,
            reviews, edition sign-ups and memberships in convention teams go with it. The last head
            organizer of a convention hands that role over first, so the convention keeps an owner.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>Your browser</Trans>}>
        <p>
          <Trans>
            OPOS uses no tracking or advertising cookies. Your sign-in session is kept in your
            browser’s local storage, for this site only.
          </Trans>
        </p>
      </Part>

      <Part title={<Trans>Your rights</Trans>}>
        <p>
          <Trans>
            Under the GDPR you have the right to access your data, to correct it, to have it
            deleted, to restrict or object to its processing, and to lodge a complaint with the
            supervisory authority; in Poland that is the President of the Personal Data Protection
            Office (UODO). You correct your name and delete your account yourself, in the account
            settings.
          </Trans>
        </p>
      </Part>
    </Page>
  )
}
