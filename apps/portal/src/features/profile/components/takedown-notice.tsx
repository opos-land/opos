import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { CONTACT_EMAIL, type MyProfile } from '@opos/contract'
import { profileRules, takedownFacts } from '@opos/i18n/profiles'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button } from '../../../shared/ui'
import { myProfileOptions, requestReviewOptions } from '../api/profile'

/**
 * What a takedown says to the account whose profile it is, as the email about it does
 * (docs/specs/0016-public-profile.md, T5-T7): what was done, under which rule of the terms,
 * whether a report came first, the admin's sentence, who decided and how to contest it. The
 * account asks for a review once; the request stays until an admin restores the profile.
 */
export function TakedownNotice({ takedown }: { takedown: NonNullable<MyProfile['takedown']> }) {
  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const ask = useMutation({
    ...requestReviewOptions(),
    meta: { success: msg`You asked for a review.` },
    onSuccess: (saved) => queryClient.setQueryData(myProfileOptions().queryKey, saved),
  })
  const rule = profileRules[takedown.reason]

  return (
    <Alert variant="destructive">
      <AlertTitle>
        <Trans>An administrator took your profile down</Trans>
      </AlertTitle>
      <AlertDescription>
        <p>
          <Trans>
            It is not public, your avatar was removed, and the profile cannot be published until an
            administrator restores it.
          </Trans>
        </p>
        {rule && <p>{i18n._(rule)}</p>}
        <p>
          {i18n._(takedown.afterReport ? takedownFacts.afterReport : takedownFacts.ownInitiative)}
        </p>
        {takedown.note && (
          <>
            <p>
              <Trans>The administrator wrote:</Trans>
            </p>
            <blockquote className="mb-4 border-l-2 pl-3 whitespace-pre-line">
              {takedown.note}
            </blockquote>
          </>
        )}
        <p>{i18n._(takedownFacts.byAPerson)}</p>
        <p>
          <Trans>
            You can change your profile and then ask for a review. If you do not agree with the
            decision, write to {CONTACT_EMAIL}.
          </Trans>
        </p>
        {takedown.reviewRequested ? (
          <p>
            <Trans>You asked for a review. An administrator will look at your profile.</Trans>
          </p>
        ) : (
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={ask.isPending}
            onClick={() => ask.mutate({})}
          >
            <Trans>Ask for a review</Trans>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
