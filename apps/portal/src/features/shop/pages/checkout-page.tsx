import { Trans, useLingui } from '@lingui/react/macro'
import {
  type Account,
  BOT_CHECK_STAND_IN,
  type Cart,
  type MyOrder,
  type Offer,
  type PlacedOrder,
} from '@opos/contract'
import { formatDateTime, isLocale } from '@opos/i18n'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { errorCode, isNotFound } from '../../../shared/lib/errors'
import { activeLocale } from '../../../shared/lib/i18n'
import { notifyFailure } from '../../../shared/lib/notify'
import { usePageTitle } from '../../../shared/lib/page-title'
import { useSession } from '../../../shared/lib/session'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  buttonVariants,
  ErrorMessage,
  linkClass,
  LoadingView,
  NotFoundView,
  Notice,
  Page,
} from '../../../shared/ui'
import { loginPath, registerPath } from '../../auth'
import {
  conventionOptions,
  discountQuoteOptions,
  editionOptions,
  myOrdersOptions,
  offerKey,
  offerOptions,
  placeOrder,
  startPaymentAttempt,
} from '../api/shop'
import { AddOnsStep } from '../components/add-ons-step'
import { HolderStep } from '../components/holder-step'
import { MerchStep } from '../components/merch-step'
import { stepName, StepsNav } from '../components/steps-nav'
import { type DiscountState, SummaryStep } from '../components/summary-step'
import { useMoney } from '../hooks/use-money'
import {
  beginCheckout,
  cartOf,
  clearDraft,
  type Draft,
  extensionDraft,
  fitToOffer,
  holderIssues,
  loadDraft,
  orderBody,
  quoteOf,
  resumeExtension,
  saveDraft,
  type StepId,
  stepsOf,
  summaryIssues,
  ticketTypeOf,
  withTicketType,
} from '../model/checkout'
import { leaveTo } from '../model/leave'
import { keepResultToken } from '../model/result-token'

/** The cart of a checkout that holds nothing: never priced, it only shapes a query that is off. */
const NO_CART: Cart = { ticket: null, addOnIds: [], items: [] }

/** The ticket type the address asks for: an identifier, `none` for merchandise alone, or nothing. */
const asked = (value: string | null) =>
  value === null ? undefined : value === 'none' ? null : value

/**
 * The checkout of an edition's shop (docs/specs/0004-checkout-and-orders.md, C1-C19, O1-O10).
 * This part reads what the checkout stands on: the convention, the edition, the offer and who is
 * signed in. The checkout itself begins once all of them are known. With `extends` in its
 * address it is "Buy more" (docs/specs/0009-buyer-self-service.md, B1-B6): a signed-in account
 * adds to its own paid order of this edition, and a visitor is asked to sign in.
 */
export function CheckoutPage() {
  const { t } = useLingui()
  const { tenantSlug = '', editionSlug = '' } = useParams()
  const [params] = useSearchParams()
  usePageTitle(t`Checkout`)
  const account = useSession((state) => state.account)
  const sessionReady = useSession((state) => state.status !== 'loading')
  const convention = useQuery(conventionOptions(tenantSlug))
  const edition = useQuery(editionOptions(tenantSlug, editionSlug))
  const offer = useQuery(offerOptions(tenantSlug, editionSlug))
  const location = useLocation()
  const shop = `/conventions/${tenantSlug}/${editionSlug}/shop`
  const ticketType = params.get('ticketType')
  const extendsId = params.get('extends')
  // The account's own orders, among which "Buy more" finds the one it adds to.
  const mine = useQuery({
    ...myOrdersOptions(tenantSlug),
    enabled: extendsId !== null && account !== null,
  })

  if (convention.isError || edition.isError || offer.isError) {
    const failed = convention.error ?? edition.error ?? offer.error
    return isNotFound(failed) ? <NotFoundView /> : <ErrorMessage error={failed} />
  }
  if (convention.isPending || edition.isPending || offer.isPending || !sessionReady) {
    return <LoadingView />
  }
  // A closed shop sells nothing: its page says so.
  if (!offer.data.open) return <Navigate to={shop} replace />

  let extending: MyOrder | undefined
  if (extendsId !== null) {
    // A visitor has no "Buy more": it is the account's own order that is added to.
    if (!account) {
      return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />
    }
    if (mine.isError) return <ErrorMessage error={mine.error} />
    if (mine.isPending) return <LoadingView />
    extending = mine.data.find(
      (order) =>
        order.id === extendsId && order.edition.id === edition.data.id && order.bought !== null,
    )
    // Not the account's, not of this edition or not paid: nothing is added to it.
    if (!extending) return <Navigate to={shop} replace />
  }

  return (
    <Checkout
      // Another ticket type asked for, another order added to, or another account, begins the
      // checkout anew from what the tab kept.
      key={`${ticketType ?? ''}:${extendsId ?? ''}:${account?.id ?? ''}`}
      tenantSlug={tenantSlug}
      editionSlug={editionSlug}
      editionId={edition.data.id}
      timeZone={convention.data.timezone}
      offer={offer.data}
      account={account}
      wanted={asked(ticketType)}
      extending={extending}
    />
  )
}

/**
 * The steps with the current one marked, the ticket type's name and the running total, updated at
 * once on every change. What the buyer entered is kept in the tab until the order is placed, so
 * Back and a reload lose nothing. The API enforces every rule again when the order is placed.
 */
function Checkout({
  tenantSlug,
  editionSlug,
  editionId,
  timeZone,
  offer,
  account,
  wanted,
  extending,
}: {
  tenantSlug: string
  editionSlug: string
  editionId: string
  timeZone: string
  offer: Offer
  account: Account | null
  wanted: string | null | undefined
  /** The account's paid order "Buy more" adds to. */
  extending?: MyOrder
}) {
  const { i18n } = useLingui()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const money = useMoney(offer.currency)
  const shop = `/conventions/${tenantSlug}/${editionSlug}/shop`
  const signedIn = account !== null
  /** The account the checkout is entered under and kept for: a visitor's is nobody's. */
  const accountId = account?.id ?? null

  const [begun] = useState(() => {
    const kept = loadDraft(tenantSlug, editionSlug, extending?.id, accountId)
    const start = extending
      ? {
          // "Buy more" has a checkout of its own, kept apart from the edition's.
          draft: kept ? resumeExtension(offer, kept, extending) : extensionDraft(offer, extending),
          removedAddOns: [],
          ask: false,
        }
      : beginCheckout(
          offer,
          kept,
          wanted,
          // A signed-in buyer's name is filled in from the account.
          account ? [account.firstName, account.lastName].filter(Boolean).join(' ') : '',
        )
    // The tab may have kept it for long: what the shop no longer offers leaves it.
    const fitted = start.draft && fitToOffer(offer, start.draft)
    return { ...start, draft: fitted ? fitted.draft : null, dropped: !!fitted?.dropped }
  })
  const [draft, setDraft] = useState(begun.draft)
  /** Whether the checkout lost something the shop no longer offers: the buyer is told. */
  const [dropped, setDropped] = useState(begun.dropped)
  const [fittedTo, setFittedTo] = useState(offer)
  // The offer was read again, as it is after the shop refused an order: the checkout follows it.
  if (fittedTo !== offer) {
    setFittedTo(offer)
    const fitted = draft && fitToOffer(offer, draft)
    if (fitted && fitted.draft !== draft) setDraft(fitted.draft)
    if (fitted?.dropped) setDropped(true)
  }
  /** Whether the buyer still has to say what becomes of the merchandise chosen before. */
  const [asking, setAsking] = useState(begun.ask)
  const [removed, setRemoved] = useState(begun.removedAddOns)
  /** The steps the buyer tried to leave: their errors show from then on, never before. */
  const [tried, setTried] = useState<ReadonlySet<StepId>>(new Set())
  /** What ran out since it was chosen, marked on its step. */
  const [ranOut, setRanOut] = useState<string | null>(null)
  const [newTotal, setNewTotal] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const form = useRef<HTMLFormElement>(null)
  /** The order this checkout placed, once it has. */
  const placedId = useRef<string | null>(null)

  const change = (changes: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current))

  // Kept in the tab on every change, so a reload resumes on the same step with the same data.
  useEffect(() => {
    if (draft) saveDraft(tenantSlug, editionSlug, draft, accountId)
  }, [draft, tenantSlug, editionSlug, accountId])

  const step = draft?.step
  useEffect(() => {
    // The heading of a new step takes the focus, so a screen reader starts where the step does.
    heading.current?.focus()
  }, [step])

  // A discount code is priced by the shop, which alone knows its terms: the Summary asks for
  // the cart's price with the code, again whenever the cart or the code changes.
  const entered = draft?.discountCode.trim() ?? ''
  const coded = useQuery({
    ...discountQuoteOptions(tenantSlug, editionSlug, draft ? cartOf(draft) : NO_CART, entered),
    enabled: draft !== null && entered !== '',
    retry: false,
  })

  const place = useMutation({
    mutationFn: async (order: { draft: Draft; totalMinor: number; withCode: boolean }) => {
      const at = { slug: tenantSlug, editionSlug, editionId }
      const placed: PlacedOrder = await placeOrder(
        at,
        orderBody(order.draft, order.totalMinor, BOT_CHECK_STAND_IN, signedIn, order.withCode),
        signedIn,
      )
      // The order is placed: the checkout is over, and its result page opens with the token.
      keepResultToken(placed.orderId, placed.resultToken)
      clearDraft(tenantSlug, editionSlug, order.draft.extending?.orderId)
      if (placed.status === 'paid') return { placed, redirectUrl: null }
      try {
        const started = await startPaymentAttempt(at, placed.orderId, placed.resultToken, signedIn)
        return { placed, redirectUrl: started.redirectUrl }
      } catch (error) {
        // The order stands and holds its stock: its result page offers another try.
        notifyFailure(error)
        return { placed, redirectUrl: null }
      }
    },
    // The page shows what came of it itself.
    meta: { success: false, failure: false },
    onSuccess: ({ placed, redirectUrl }) => {
      placedId.current = placed.orderId
      if (redirectUrl) leaveTo(redirectUrl)
      else void navigate(`${shop}/result/${placed.orderId}`, { replace: true })
    },
    onError: (error) => {
      const code = errorCode(error)
      const data: unknown = error instanceof ORPCError ? error.data : undefined
      const named = (data ?? {}) as { kind?: unknown; id?: unknown; totalMinor?: unknown }
      // What the shop offers changed: it is read again, and the buyer sees it as it is now.
      void queryClient.invalidateQueries({ queryKey: offerKey(tenantSlug, editionSlug) })
      if (code === 'order.unavailable' && named.kind === 'discount-code') {
        // The code was used up or ended since it was applied: asked again, the shop refuses
        // it, and the Summary says so beside the code.
        void coded.refetch()
        return
      }
      if (code === 'order.unavailable' && typeof named.id === 'string') {
        // Back to the step of what ran out, with it marked.
        setRanOut(named.id)
        if (named.kind === 'add-on') return change({ step: 'add-ons' })
        if (named.kind === 'variant') return change({ step: 'merch' })
      }
      if (code === 'order.total-changed' && typeof named.totalMinor === 'number') {
        // A total never changes silently: the buyer is shown the new one and confirms it. With
        // a discount code the total shown is the shop's own price of the cart, so that is asked
        // again; nothing is placed while it is.
        if (entered !== '') void coded.refetch()
        return setNewTotal(named.totalMinor)
      }
      if (code === 'order.email-refused') change({ step: 'holder' })
      notifyFailure(error)
    },
  })

  // Back from the provider's page, a browser may show this page again out of its memory, as it
  // was left: with its order placed and nothing more to do here. The order's result takes over.
  useEffect(() => {
    const shown = (event: PageTransitionEvent) => {
      if (!event.persisted || placedId.current === null) return
      void navigate(`${shop}/result/${placedId.current}`, { replace: true })
    }
    window.addEventListener('pageshow', shown)
    return () => window.removeEventListener('pageshow', shown)
  }, [navigate, shop])

  // Nothing chosen and nothing kept: the listing is where a checkout starts.
  if (!draft) return <Navigate to={shop} replace />

  // The buyer returned to the listing and picked another ticket type with merchandise chosen:
  // they say whether to keep it. Add-ons the new one does not offer are removed, with a notice.
  if (asking && wanted !== undefined) {
    const swap = (keepMerchandise: boolean) => {
      const next = withTicketType(offer, draft, wanted, keepMerchandise)
      setRemoved(next.removedAddOns)
      setDraft(next.draft)
      setAsking(false)
    }
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Keep the merchandise you chose?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                You picked another ticket type. Merchandise it does not offer is removed either way.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => swap(false)}>
              <Trans>Remove the merchandise</Trans>
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => swap(true)}>
              <Trans>Keep the merchandise</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  const type = ticketTypeOf(offer, draft)
  const merchOnly = draft.ticketTypeId === null
  // A ticket type that is gone from the offer cannot be checked out: back to the listing, where
  // picking another one carries over what was entered.
  if (!merchOnly && !type) return <Navigate to={shop} replace />

  const steps = stepsOf(offer, draft)
  const current: StepId = steps.includes(draft.step) ? draft.step : steps[0]!
  const index = steps.indexOf(current)
  const local = quoteOf(offer, draft)
  // The shop's own price of the cart with the code, while it takes the code.
  const applied = entered !== '' && coded.isSuccess && !('problem' in local)
  const quote = applied ? coded.data : local
  const lines = 'problem' in quote ? [] : quote.lines
  const totalMinor = 'problem' in quote ? 0 : quote.totalMinor
  // What of the cart cannot be had as the offer now stands. A cart with nothing in it is not
  // one of them: its step asks for something to order.
  const problem = 'problem' in local && local.problem.kind !== 'empty' ? local.problem : null
  /** What ran out since it was chosen, as the shop said on refusing the order or as the offer shows. */
  const marked = ranOut ?? (problem && 'id' in problem ? problem.id : null)
  const refused = coded.isError && errorCode(coded.error) === 'discount-code.refused'
  const discount: DiscountState = {
    applied,
    refused: entered !== '' && refused,
    pending: entered !== '' && coded.isFetching,
    failure: entered !== '' && coded.isError && !refused ? coded.error : null,
  }
  const issues = holderIssues(offer, draft, account?.email ?? null)
  const locale = isLocale(i18n.locale) ? i18n.locale : activeLocale()
  const here = `${location.pathname}${location.search}`
  /**
   * An order of merchandise alone with no item, as one the shop took all the items out of: the
   * Merch step asks for one, and the Summary has no order to show.
   */
  const emptyMerchOnly = merchOnly && !draft.extending && draft.items.length === 0
  /** Such an order with no item to add either: the offer sells no merchandise alone now. */
  const noMerchAlone = emptyMerchOnly && !offer.merchOnly
  /** "Buy more" with nothing chosen: there is nothing to order. */
  const nothingMore =
    draft.extending !== null && draft.addOnIds.length === 0 && draft.items.length === 0
  const firstNumber = draft.extending?.number

  // A buyer who is not signed in is offered, before the email is asked, to go on without an
  // account or to sign in or create one.
  const gate = current === 'holder' && !signedIn && !draft.asVisitor

  /** The order is being placed, or is placed and the page is about to be left. */
  const placing = place.isPending || place.isSuccess

  const go = (to: StepId) => {
    setRanOut(null)
    change({ step: to })
  }
  const next = (event: FormEvent) => {
    event.preventDefault()
    setTried((left) => new Set(left).add(current))
    if (current === 'holder' && Object.keys(issues).length > 0) {
      // Each field shows its own message, and the first one takes the focus.
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    // An order of merchandise alone needs at least one item.
    if (current === 'merch' && emptyMerchOnly) return
    if (current === 'summary') {
      // What the first step asks holds when the order is placed too. A checkout that reached
      // the Summary without it, as one kept from before the edition asked for it, goes back.
      if (steps.includes('holder') && Object.keys(issues).length > 0) {
        setTried((left) => new Set(left).add('holder'))
        return go('holder')
      }
      const missing = summaryIssues(offer, draft, totalMinor)
      if (missing.consents.length > 0 || missing.provider || missing.guardian) return
      if ('problem' in quote) return
      // Never at a price the buyer has not seen: the code's is still being asked.
      if (discount.pending) return
      // One order a checkout: none while it is being placed, and none once it is, while the
      // browser still leaves for the provider or for the result.
      if (placing) return
      setNewTotal(null)
      place.mutate({ draft, totalMinor, withCode: applied })
      return
    }
    go(steps[index + 1]!)
  }

  return (
    <Page
      title={
        // The button that leads here says the same in English, and another form in Polish.
        draft.extending ? <Trans context="page title">Buy more</Trans> : <Trans>Checkout</Trans>
      }
    >
      <p>
        <Link to={shop} className={linkClass}>
          <Trans>Back to the shop</Trans>
        </Link>
      </p>
      <StepsNav steps={steps} current={current} merchOnly={merchOnly} />
      <p aria-live="polite" className="flex flex-wrap justify-between gap-2 font-medium">
        <span>
          {type ? (
            type.name
          ) : draft.extending ? (
            <Trans>More for the order {firstNumber}</Trans>
          ) : (
            <Trans>Merch only</Trans>
          )}
        </span>
        <span>
          <Trans>Total: {money(totalMinor)}</Trans>
        </span>
      </p>
      {removed.length > 0 && (
        <Notice>
          <Trans>
            This ticket type does not offer what you had chosen, so it was removed:{' '}
            {removed.join(', ')}.
          </Trans>
        </Notice>
      )}
      {dropped && (
        <Notice>
          <Trans>
            The shop no longer offers something you had chosen, so it was removed from your order.
            Check the order before you place it.
          </Trans>
        </Notice>
      )}
      {problem?.kind === 'ticket-type' && (
        <p className="text-destructive" role="alert">
          <Trans>
            This ticket type is not on sale now.{' '}
            <Link to={shop} className={linkClass}>
              Choose another one in the shop.
            </Link>
          </Trans>
        </p>
      )}

      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
        {i18n._(stepName(current, merchOnly))}
      </h2>

      {gate ? (
        <div className="flex flex-col gap-3">
          <p>
            <Trans>
              You can order without an account. With an account you find your orders in one place.
            </Trans>
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => change({ asVisitor: true })}>
              <Trans>Continue without an account</Trans>
            </Button>
            <Link to={loginPath(here)} className={buttonVariants({ variant: 'outline' })}>
              <Trans>Sign in</Trans>
            </Link>
            <Link to={registerPath(here)} className={buttonVariants({ variant: 'outline' })}>
              <Trans>Create an account</Trans>
            </Link>
          </div>
        </div>
      ) : (
        <form ref={form} onSubmit={next} noValidate className="flex flex-col gap-6">
          {current === 'holder' && (
            <HolderStep
              offer={offer}
              draft={draft}
              issues={tried.has('holder') ? issues : {}}
              accountEmail={account?.email ?? null}
              change={change}
            />
          )}
          {current === 'add-ons' && (
            <AddOnsStep
              tenantSlug={tenantSlug}
              offer={offer}
              draft={draft}
              ranOut={marked}
              change={change}
            />
          )}
          {current === 'merch' && (
            <MerchStep
              offer={offer}
              draft={draft}
              tenantSlug={tenantSlug}
              ranOut={marked}
              preorderDeadline={
                offer.merchPreorderDeadline &&
                formatDateTime(new Date(offer.merchPreorderDeadline), locale, timeZone, {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })
              }
              change={change}
            />
          )}
          {current === 'summary' && (problem?.kind === 'merch-only' || noMerchAlone) && (
            <p className="text-destructive" role="alert">
              <Trans>
                Merchandise cannot be ordered without a ticket now.{' '}
                <Link to={shop} className={linkClass}>
                  Choose a ticket type in the shop.
                </Link>
              </Trans>
            </p>
          )}
          {current === 'summary' &&
            problem &&
            !['ticket-type', 'merch-only'].includes(problem.kind) && (
              <p className="text-destructive" role="alert">
                <Trans>
                  Something you chose is no longer available. Go back to its step and change it.
                </Trans>
              </p>
            )}
          {current === 'summary' && !problem && !emptyMerchOnly && (
            <>
              {newTotal !== null && (
                <Notice>
                  <Trans>
                    The total of your order changed to {money(newTotal)}. Check it and place the
                    order again to confirm.
                  </Trans>
                </Notice>
              )}
              <SummaryStep
                offer={offer}
                draft={draft}
                tenantSlug={tenantSlug}
                lines={lines}
                totalMinor={totalMinor}
                email={account?.email ?? draft.email.trim().toLowerCase()}
                marked={tried.has('summary')}
                discount={discount}
                joins={draft.extending?.number}
                change={change}
              />
              {nothingMore && tried.has('summary') && (
                <p className="text-destructive" role="alert">
                  <Trans>Choose at least one add-on or item to order.</Trans>
                </p>
              )}
            </>
          )}
          {emptyMerchOnly &&
            (current === 'merch' ? tried.has('merch') : current === 'summary' && !noMerchAlone) && (
              <p className="text-destructive" role="alert">
                <Trans>Add at least one item to order.</Trans>
              </p>
            )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {index > 0 ? (
              <Button type="button" variant="outline" onClick={() => go(steps[index - 1]!)}>
                <Trans>Back</Trans>
              </Button>
            ) : (
              <span />
            )}
            {current !== 'summary' ? (
              <Button type="submit">
                <Trans>Next</Trans>
              </Button>
            ) : problem || emptyMerchOnly ? (
              // Nothing to place while a part of the order cannot be had: the page says which.
              <span />
            ) : (
              <Button type="submit" disabled={placing || discount.pending}>
                {totalMinor > 0 ? (
                  <Trans>Order and pay</Trans>
                ) : (
                  <Trans context="the button that places an order with nothing to pay">Order</Trans>
                )}
              </Button>
            )}
          </div>
        </form>
      )}
    </Page>
  )
}
