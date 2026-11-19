import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type AgeBand, type Offer } from '@opos/contract'
import {
  FormField,
  Input,
  linkClass,
  NativeSelect,
  NativeSelectOption,
  Notice,
} from '../../../shared/ui'
import { useMoney } from '../hooks/use-money'
import { answerField, type Draft, type FieldIssue, ticketTypeOf } from '../model/checkout'

const AGE_BAND_NAMES: Record<AgeBand, MessageDescriptor> = {
  child: msg`Child`,
  teen: msg`Teen`,
  adult: msg`Adult`,
}

/** The years an age band covers, as the edition set them. */
function ages(band: AgeBand, bands: NonNullable<Offer['ageBands']>): MessageDescriptor {
  const { teenFromAge, adultFromAge } = bands
  if (band === 'child') return msg`under ${teenFromAge}`
  if (band === 'teen') return msg`${teenFromAge} to ${adultFromAge - 1}`
  return msg`${adultFromAge} and over`
}

/** What is wrong with a field, as its own message. */
function useIssueText() {
  const { t } = useLingui()
  return (issue: FieldIssue | undefined, field: 'email' | 'confirmation' | 'ageBand' | 'other') => {
    if (!issue) return undefined
    if (issue === 'required') return t`Fill in this field.`
    if (issue === 'mismatch') return t`Emails do not match.`
    if (issue === 'too-long') {
      return t`The payment provider cannot take an email address this long. Use a shorter one.`
    }
    if (issue === 'not-allowed') return t`This ticket type is not sold for this age band.`
    return field === 'email' ? t`Enter a valid email address.` : t`This value is not valid.`
  }
}

/**
 * The first step (docs/specs/0004-checkout-and-orders.md, C4-C9, C18): what the ticket type
 * gives, then the ticket holder's name and age band, a visitor's email typed twice, and the
 * edition's custom fields. An order of merchandise alone asks for the buyer's name and email
 * only. No field shows an error before the buyer tried to go on.
 */
export function HolderStep({
  offer,
  draft,
  issues,
  accountEmail,
  change,
}: {
  offer: Offer
  draft: Draft
  /** The fields that do not hold, shown once the buyer tried to go on. */
  issues: Record<string, FieldIssue>
  /** The signed-in buyer's email, which is the account's and cannot be changed. */
  accountEmail: string | null
  change: (changes: Partial<Draft>) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney(offer.currency)
  const issueText = useIssueText()
  const type = ticketTypeOf(offer, draft)
  const merchOnly = draft.ticketTypeId === null
  // The ticket types that sell for the age band chosen, when this one does not.
  const allowing =
    issues.ageBand === 'not-allowed' && draft.ageBand
      ? offer.ticketTypes
          .filter((other) => other.state === 'on-sale' && other.ageBands.includes(draft.ageBand!))
          .map((other) => other.name)
      : []

  return (
    <div className="flex flex-col gap-4">
      {type && (
        <div className="flex flex-col gap-2">
          {type.longDescription && <p>{type.longDescription}</p>}
          {type.perks.length > 0 && (
            <ul className="list-disc pl-5">
              {type.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          )}
          {type.discountsExcluded && (
            <p className="text-muted-foreground text-sm">
              <Trans>No discount code applies to this ticket type.</Trans>
            </p>
          )}
          {type.priceMinor !== null && type.supporterPrices.length > 0 && (
            <FormField
              label={<Trans>Price</Trans>}
              hint={
                <Trans>
                  A supporter price is a higher price you choose to support the convention.
                </Trans>
              }
            >
              {(control) => (
                <NativeSelect
                  {...control}
                  value={draft.supporterPriceMinor ?? ''}
                  onChange={(event) =>
                    change({
                      supporterPriceMinor:
                        event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                >
                  <NativeSelectOption value="">
                    {t`Regular price: ${money(type.priceMinor!)}`}
                  </NativeSelectOption>
                  {type.supporterPrices.map((price) => (
                    <NativeSelectOption key={price} value={price}>
                      {t`Supporter price: ${money(price)}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
        </div>
      )}

      <FormField
        label={
          merchOnly ? (
            <Trans>Your name or nickname</Trans>
          ) : (
            <Trans>Ticket holder’s name or nickname</Trans>
          )
        }
        error={issueText(issues.holderName, 'other')}
      >
        {(control) => (
          <Input
            {...control}
            name="holderName"
            autoComplete="name"
            maxLength={200}
            value={draft.holderName}
            onChange={(event) => change({ holderName: event.target.value })}
          />
        )}
      </FormField>

      {!merchOnly && type && (
        <FormField
          label={<Trans>Age band</Trans>}
          hint={<Trans>By the ticket holder’s age on the first day of the edition.</Trans>}
          error={
            issues.ageBand === 'not-allowed' && allowing.length > 0
              ? t`This ticket type is not sold for this age band. It is sold with: ${allowing.join(', ')}.`
              : issueText(issues.ageBand, 'ageBand')
          }
        >
          {(control) => (
            <NativeSelect
              {...control}
              name="ageBand"
              value={draft.ageBand ?? ''}
              onChange={(event) =>
                change({
                  ageBand: event.target.value === '' ? null : (event.target.value as AgeBand),
                  guardianAcknowledged: false,
                })
              }
            >
              <NativeSelectOption value="">{t`Choose`}</NativeSelectOption>
              {(['child', 'teen', 'adult'] as const).map((band) => (
                <NativeSelectOption key={band} value={band}>
                  {i18n._(AGE_BAND_NAMES[band])}
                  {offer.ageBands ? ` (${i18n._(ages(band, offer.ageBands))})` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      )}
      {!merchOnly && draft.ageBand === 'child' && (
        <Notice>
          <Trans>A child enters only with a guardian present.</Trans>
        </Notice>
      )}
      {!merchOnly && draft.ageBand === 'teen' && (
        <Notice>
          <Trans>A teen brings the guardian’s consent on paper to the convention.</Trans>{' '}
          {offer.guardianConsentFormUrl && (
            <a
              href={offer.guardianConsentFormUrl}
              className={linkClass}
              target="_blank"
              rel="noreferrer"
            >
              <Trans>Download the guardian consent form</Trans>
            </a>
          )}
        </Notice>
      )}

      {accountEmail !== null ? (
        <p>
          <Trans>
            The QR code will be sent to your account’s address: <strong>{accountEmail}</strong>
          </Trans>
        </p>
      ) : (
        <>
          <FormField
            label={<Trans>Email address</Trans>}
            hint={<Trans>The QR code of your order will be sent to this address.</Trans>}
            error={issueText(issues.email, 'email')}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                name="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => change({ email: event.target.value })}
              />
            )}
          </FormField>
          <FormField
            label={<Trans>Repeat the email address</Trans>}
            error={issueText(issues.emailConfirmation, 'confirmation')}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                name="emailConfirmation"
                autoComplete="email"
                value={draft.emailConfirmation}
                onChange={(event) => change({ emailConfirmation: event.target.value })}
              />
            )}
          </FormField>
        </>
      )}

      {!merchOnly &&
        offer.customFields.map((field) => (
          <FormField
            key={field.id}
            label={field.isRequired ? field.label : t`${field.label} (optional)`}
            error={issueText(issues[answerField(field.id)], 'other')}
          >
            {(control) => (
              <Input
                {...control}
                name={answerField(field.id)}
                maxLength={200}
                value={draft.answers[field.id] ?? ''}
                onChange={(event) =>
                  change({ answers: { ...draft.answers, [field.id]: event.target.value } })
                }
              />
            )}
          </FormField>
        ))}
    </div>
  )
}
