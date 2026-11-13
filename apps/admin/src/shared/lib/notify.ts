import { type MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { Trans } from '@lingui/react'
import { createElement } from 'react'
import { toast } from '../ui/toast'
import { describeError, isRefusal } from './errors'

/**
 * What a write says (`meta` of `useMutation`). `success` is a message, one worded from what the
 * write returned, or `false` for a write whose screen shows the result itself; `failure: false`
 * leaves the failure to a screen that is nothing but the write's outcome.
 */
// A type, not an interface: TanStack's mutation meta must be a record.
export type WriteMeta = {
  success?: MessageDescriptor | ((result: never) => MessageDescriptor) | false
  failure?: false
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: WriteMeta
  }
}

const SAVED = msg`The changes are saved.`

/** A message translated as it shows, so a change of language words it again. */
const shown = ({ id, message, values }: MessageDescriptor, params?: MessageDescriptor['values']) =>
  createElement(Trans, { id, message, values: params ?? values })

/** A success notification for a write (docs/ARCHITECTURE.md, Frontends). */
export function notifySuccess(meta: WriteMeta | undefined, result: unknown) {
  const success = meta?.success
  if (success === false) return
  const message =
    typeof success === 'function'
      ? (success as (result: unknown) => MessageDescriptor)(result)
      : (success ?? SAVED)
  toast.add({ type: 'success', title: shown(message) })
}

/**
 * A failed write: a warning for a refusal the member can act on, an error for a failure of the
 * service or the network, announced at once. Either stays until it is closed.
 */
export function notifyFailure(error: unknown, meta?: WriteMeta) {
  if (meta?.failure === false) return
  const { message, values } = describeError(error)
  const refusal = isRefusal(error)
  toast.add({
    type: refusal ? 'warning' : 'error',
    title: shown(message, values),
    timeout: 0,
    priority: refusal ? 'low' : 'high',
  })
}

const SIGN_IN_AGAIN = msg`Your sign-in is too old for this action. Sign in again with your password and the code, then repeat it.`

/**
 * A write the API refused for the age of the admin's sign-in: the application leads back to
 * sign-in, and this says why and what to do next. The catalog's own message for the refusal
 * offers Google, which the admin application does not have.
 */
export function notifySignInAgain() {
  toast.add({ type: 'warning', title: shown(SIGN_IN_AGAIN), timeout: 0, priority: 'low' })
}
