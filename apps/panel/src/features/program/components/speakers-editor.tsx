import { zodResolver } from '@hookform/resolvers/zod'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { MAX_SPEAKERS, type ProgramItem } from '@opos/contract'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button, ErrorMessage, Field, inputClass } from '../../../shared/ui'
import { useCurrentTenant } from '../../tenants'
import { programKey, putSpeakersOptions } from '../api/program'
import { addSpeakerSchema, emailsWith, emailsWithout, speakerName } from '../model/speakers'

/** The speakers of a programme item; `program=write` adds and removes them by email address. */
export function SpeakersEditor({ item, canWrite }: { item: ProgramItem; canWrite: boolean }) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const put = useMutation({
    ...putSpeakersOptions(api),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: programKey(api) }),
  })
  const form = useForm({
    resolver: zodResolver(addSpeakerSchema),
    defaultValues: { email: '' },
  })
  const params = { editionId: item.editionId, programItemId: item.id }
  const limit = MAX_SPEAKERS

  const add = form.handleSubmit(({ email }) => {
    put.mutate(
      { params, body: { emails: emailsWith(item.speakers, email) } },
      { onSuccess: () => form.reset() },
    )
  })

  return (
    <div className="flex flex-col gap-3">
      {item.speakers.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {item.speakers.map((speaker) => {
            const name = speakerName(speaker)
            const email = speaker.email
            return (
              <li key={email} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{name}</span>
                {name !== email && <span className="text-muted">{email}</span>}
                {canWrite && (
                  <Button
                    variant="secondary"
                    aria-label={t`Remove ${email}`}
                    disabled={put.isPending}
                    onClick={() =>
                      put.mutate({ params, body: { emails: emailsWithout(item.speakers, email) } })
                    }
                  >
                    <Trans>Remove</Trans>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm">
          <Trans>This item has no speakers yet.</Trans>
        </p>
      )}
      {canWrite &&
        (item.speakers.length < limit ? (
          <form
            onSubmit={(event) => void add(event)}
            noValidate
            className="flex max-w-lg flex-col gap-2"
          >
            <Field
              label={t`Speaker email`}
              hint={t`The address of the speaker's confirmed account.`}
              error={form.formState.errors.email && t`Enter a valid email address.`}
            >
              {(control) => (
                <input
                  {...control}
                  {...form.register('email')}
                  type="email"
                  className={inputClass}
                />
              )}
            </Field>
            <div>
              <Button type="submit" pending={put.isPending}>
                <Trans>Add</Trans>
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-muted text-sm">
            <Plural
              value={limit}
              one="An item can have up to # speaker."
              other="An item can have up to # speakers."
            />
          </p>
        ))}
      <ErrorMessage error={put.error} />
    </div>
  )
}
