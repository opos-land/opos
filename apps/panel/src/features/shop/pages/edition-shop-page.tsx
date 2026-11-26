import { msg } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { type EditionShop, SHOP_CONDITIONS, updateEditionShopSchema } from '@opos/contract'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { changedFrom } from '../../../shared/lib/changes'
import { usePageTitle } from '../../../shared/lib/page-title'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ErrorMessage,
  FieldSet,
  FormField,
  Input,
  LoadingView,
  NoPermissionView,
  PageHeader,
  Section,
  Textarea,
} from '../../../shared/ui'
import { useEditionBySlug } from '../../editions'
import { atLeast, useCurrentTenant, useTenantTime } from '../../tenants'
import {
  closeShopOptions,
  editionShopOptions,
  openShopOptions,
  shopKey,
  updateEditionShopOptions,
} from '../api/shop'
import { CONDITION_LABELS, missingConditions } from '../model/documents'

/**
 * The shop of an edition (`/editions/:editionSlug/shop`): whether it is open, what opening asks
 * for, each condition as met or missing, the message of a shop with nothing on sale and the
 * address of its FAQ. Reading needs tickets>=read
 * in the edition, changing tickets=write. Of the convention's provider account and seller's
 * details it shows a yes or a no, and leads to them only who holds the shop permission.
 */
export function EditionShopPage() {
  const { t } = useLingui()
  const { editionSlug } = useParams()
  const { tenant, access, api } = useCurrentTenant()
  const { edition, isPending, isError, error } = useEditionBySlug(editionSlug)
  usePageTitle(t`Shop`, edition?.name ?? tenant.name)
  const level = edition ? access.edition(edition.id).tickets : 'none'
  const shop = useQuery({
    ...editionShopOptions(api, edition?.id ?? ''),
    enabled: atLeast(level, 'read'),
  })

  if (isPending) return <LoadingView />
  if (isError) return <ErrorMessage error={error} />
  if (!edition || !atLeast(level, 'read')) return <NoPermissionView />

  const canWrite = atLeast(level, 'write')
  return (
    <>
      <PageHeader title={<Trans>Shop</Trans>} description={edition.name} />
      {shop.isPending ? (
        <LoadingView />
      ) : shop.isError ? (
        <ErrorMessage error={shop.error} />
      ) : (
        <>
          <Opening
            shop={shop.data}
            editionId={edition.id}
            editionSlug={edition.slug}
            canWrite={canWrite}
          />
          {/* What the edition holds by now fills each form anew. */}
          <ClosedMessage
            key={`message ${shop.data.salesClosedMessage ?? ''}`}
            shop={shop.data}
            editionId={edition.id}
            canWrite={canWrite}
          />
          <Faq
            key={`faq ${shop.data.faqUrl ?? ''}`}
            shop={shop.data}
            editionId={edition.id}
            canWrite={canWrite}
          />
          <Reminder
            key={JSON.stringify([shop.data.reminderDaysBefore, shop.data.openingHours])}
            shop={shop.data}
            editionId={edition.id}
            canWrite={canWrite}
          />
        </>
      )}
    </>
  )
}

/** Whether the shop is open, the conditions of opening, and the buttons that open and close it. */
function Opening({
  shop,
  editionId,
  editionSlug,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  editionSlug: string
  canWrite: boolean
}) {
  const { i18n } = useLingui()
  const { tenant, access, api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const listId = useId()
  const set = (saved: EditionShop) =>
    queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved)
  const open = useMutation({
    ...openShopOptions(api),
    meta: { success: msg`The shop is open.` },
    onSuccess: set,
    // A refusal names what is missing: the conditions are read again, as they stand now.
    onError: () => queryClient.invalidateQueries({ queryKey: shopKey(api) }),
  })
  const close = useMutation({
    ...closeShopOptions(api),
    meta: { success: msg`The shop is closed.` },
    onSuccess: set,
  })
  const refused = open.isError ? missingConditions(open.error) : []
  const openedAt = shop.openedAt ? time.format(shop.openedAt) : ''

  return (
    <Section title={<Trans>Opening</Trans>}>
      <p className="text-sm">
        {shop.open ? (
          <Trans>
            The shop has been open since {openedAt}. Buyers reach it while the edition is published.
          </Trans>
        ) : (
          <Trans>The shop is closed: nothing can be ordered.</Trans>
        )}
      </p>
      {refused.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            <Trans>The shop was not opened. These conditions are not met yet:</Trans>
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {refused.map((condition) => (
                <li key={condition}>{i18n._(CONDITION_LABELS[condition])}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <h3 id={listId} className="text-sm font-medium">
        <Trans>What opening the shop needs</Trans>
      </h3>
      <ul aria-labelledby={listId} className="flex max-w-2xl flex-col gap-2 text-sm">
        {SHOP_CONDITIONS.map((condition) => (
          <li key={condition} className="flex items-center justify-between gap-4">
            <span>{i18n._(CONDITION_LABELS[condition])}</span>
            {shop.conditions[condition] ? (
              <Badge variant="secondary">
                <Trans>Met</Trans>
              </Badge>
            ) : (
              <Badge variant="destructive">
                <Trans>Missing</Trans>
              </Badge>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground max-w-2xl text-sm">
        <Trans>
          The documents are published in{' '}
          <Link
            to={`/${tenant.slug}/editions/${editionSlug}/documents`}
            className="text-primary underline"
          >
            Documents and consents
          </Link>
          . The payment provider account and the seller’s details belong to the whole convention.
        </Trans>{' '}
        {atLeast(access.shop, 'read') && (
          <Link to={`/${tenant.slug}/settings/shop`} className="text-primary underline">
            <Trans>Shop settings of the convention</Trans>
          </Link>
        )}
      </p>
      {canWrite && (
        <div>
          {shop.open ? (
            <Button
              variant="outline"
              disabled={close.isPending}
              onClick={() => close.mutate({ params: { editionId } })}
            >
              <Trans>Close the shop</Trans>
            </Button>
          ) : (
            <Button
              disabled={open.isPending}
              onClick={() => open.mutate({ params: { editionId } })}
            >
              <Trans>Open the shop</Trans>
            </Button>
          )}
        </div>
      )}
    </Section>
  )
}

/** What the shop shows in place of products while it is closed or nothing is on sale. */
function ClosedMessage({
  shop,
  editionId,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(shop.salesClosedMessage ?? '')
  const update = useMutation({
    ...updateEditionShopOptions(api),
    meta: { success: msg`The message is saved.` },
    onSuccess: (saved) =>
      queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved),
  })

  return (
    <Section title={<Trans>While nothing is on sale</Trans>}>
      <form
        noValidate
        className="flex max-w-lg flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          update.mutate({
            params: { editionId },
            body: { salesClosedMessage: value.trim() || null },
          })
        }}
      >
        <FieldSet disabled={!canWrite}>
          <FormField
            label={t`Message of a closed shop`}
            hint={t`Shown in place of products while the shop is closed or nothing is on sale, up to 1000 characters. Leave it empty for the shop’s own short notice.`}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={1000}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </FormField>
        </FieldSet>
        {canWrite && (
          <div>
            <Button type="submit" disabled={update.isPending}>
              <Trans>Save the message</Trans>
            </Button>
          </div>
        )}
      </form>
    </Section>
  )
}

/** The address of the edition's FAQ, which the shop's footer links. */
function Faq({
  shop,
  editionId,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(shop.faqUrl ?? '')
  const [invalid, setInvalid] = useState(false)
  const update = useMutation({
    ...updateEditionShopOptions(api),
    meta: { success: msg`The address of the FAQ is saved.` },
    onSuccess: (saved) =>
      queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved),
  })

  const save = () => {
    const parsed = updateEditionShopSchema.safeParse({ faqUrl: value.trim() || null })
    setInvalid(!parsed.success)
    if (parsed.success) update.mutate({ params: { editionId }, body: parsed.data })
  }

  return (
    <Section title={<Trans>FAQ</Trans>}>
      <form
        noValidate
        className="flex max-w-lg flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <FieldSet disabled={!canWrite}>
          <FormField
            label={t`Address of the FAQ`}
            hint={t`A page with answers for buyers, linked from the shop’s footer. Leave it empty for none.`}
            error={invalid && t`Enter an address that starts with https:// or http://.`}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </FormField>
        </FieldSet>
        {canWrite && (
          <div>
            <Button type="submit" disabled={update.isPending}>
              <Trans>Save the address</Trans>
            </Button>
          </div>
        )}
      </form>
    </Section>
  )
}

/**
 * The reminder a buyer gets before the edition (docs/specs/0011-pre-edition-reminder.md): how
 * many days before the first day it goes out, and the opening hours it tells, with the day it
 * will go out and, once it did, when.
 */
function Reminder({
  shop,
  editionId,
  canWrite,
}: {
  shop: EditionShop
  editionId: string
  canWrite: boolean
}) {
  const { t } = useLingui()
  const { api } = useCurrentTenant()
  const time = useTenantTime()
  const queryClient = useQueryClient()
  const [days, setDays] = useState(
    shop.reminderDaysBefore === null ? '' : String(shop.reminderDaysBefore),
  )
  const [hours, setHours] = useState(shop.openingHours ?? '')
  const [invalid, setInvalid] = useState(false)
  const update = useMutation({
    ...updateEditionShopOptions(api),
    meta: { success: msg`The reminder is saved.` },
    onSuccess: (saved) =>
      queryClient.setQueryData(editionShopOptions(api, editionId).queryKey, saved),
  })
  const due = shop.reminderDueAt ? time.format(shop.reminderDueAt) : null
  const sent = shop.reminderSentAt ? time.format(shop.reminderSentAt) : null

  const save = () => {
    const typed = days.trim()
    const reminderDaysBefore = typed === '' ? null : /^\d{1,2}$/.test(typed) ? Number(typed) : NaN
    const wrong =
      reminderDaysBefore !== null && !(reminderDaysBefore >= 1 && reminderDaysBefore <= 60)
    setInvalid(wrong)
    if (wrong) return
    update.mutate({
      params: { editionId },
      // Only what was changed here: the rest stays as someone else may have set it meanwhile.
      body: changedFrom(shop, { reminderDaysBefore, openingHours: hours.trim() || null }),
    })
  }

  return (
    <Section title={<Trans>Reminder before the edition</Trans>}>
      <p className="max-w-2xl text-sm">
        <Trans>
          A few days before the edition every buyer gets one email with the QR code, the opening
          hours and where to pick up merchandise. It goes out at 9:00 in the convention’s time zone.
        </Trans>
      </p>
      <p className="text-sm">
        {sent ? (
          <Trans>
            The reminder went out on {sent}. It goes out once: a change now sends nothing again.
          </Trans>
        ) : due ? (
          <Trans>The reminder will go out on {due}.</Trans>
        ) : (
          <Trans>No reminder is sent while no number of days is set.</Trans>
        )}
      </p>
      <form
        noValidate
        className="flex max-w-lg flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <FieldSet disabled={!canWrite}>
          <FormField
            label={t`Days before the edition`}
            hint={t`How many days before the first day of the edition the reminder goes out, from 1 to 60. Leave it empty to send none.`}
            error={invalid && t`Enter a whole number from 1 to 60, or leave it empty.`}
          >
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label={t`Opening hours`}
            hint={t`When the edition is open, as the reminder tells it. Up to 1000 characters.`}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={1000}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            )}
          </FormField>
        </FieldSet>
        {canWrite && (
          <div>
            <Button type="submit" disabled={update.isPending}>
              <Trans>Save the reminder</Trans>
            </Button>
          </div>
        )}
      </form>
    </Section>
  )
}
