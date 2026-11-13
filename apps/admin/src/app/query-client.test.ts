import { msg } from '@lingui/core/macro'
import { ORPCError } from '@orpc/client'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyFailure, notifySignInAgain, notifySuccess } from '../shared/lib/notify'
import { signInAgain } from '../shared/lib/session'
import { createQueryClient } from './query-client'

vi.mock('../shared/lib/notify', () => ({
  notifySuccess: vi.fn(),
  notifyFailure: vi.fn(),
  notifySignInAgain: vi.fn(),
}))
vi.mock('../shared/lib/session', () => ({ signInAgain: vi.fn() }))

const write = (mutationFn: () => Promise<unknown>, meta?: Record<string, unknown>) =>
  new MutationObserver(createQueryClient(), { mutationFn, meta }).mutate().catch(() => undefined)

const read = (queryFn: () => Promise<unknown>) =>
  new QueryObserver(createQueryClient(), { queryKey: ['read'], queryFn, retry: false }).refetch()

beforeEach(() => {
  vi.mocked(notifySuccess).mockReset()
  vi.mocked(notifyFailure).mockReset()
  vi.mocked(notifySignInAgain).mockReset()
  vi.mocked(signInAgain).mockReset()
})

describe('createQueryClient', () => {
  it('notifies the success of every write, with what the write returned', async () => {
    const meta = { success: msg`The convention is suspended.` }
    await write(() => Promise.resolve({ id: 't-1' }), meta)

    expect(notifySuccess).toHaveBeenCalledWith(meta, { id: 't-1' })
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it('notifies the failure of every write', async () => {
    const refusal = new ORPCError('tenant.slug-taken', { status: 409 })
    const meta = { failure: false }
    await write(() => Promise.reject(refusal), meta)

    expect(notifyFailure).toHaveBeenCalledWith(refusal, meta)
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  it('leads back to sign-in when a read finds the sign-in too old', async () => {
    await read(() =>
      Promise.reject(new ORPCError('session.reauthentication-required', { status: 401 })),
    )

    expect(signInAgain).toHaveBeenCalledOnce()
    // The sign-in page says the rest; a read has nothing to repeat.
    expect(notifySignInAgain).not.toHaveBeenCalled()
  })

  it.each(['permission.denied', 'admin.grant-outdated', 'server.error'])(
    'leaves a read answered %s to its screen',
    async (code) => {
      await read(() => Promise.reject(new ORPCError(code, { status: 403 })))

      expect(signInAgain).not.toHaveBeenCalled()
    },
  )

  it('leads a write refused for the age of the sign-in back to sign-in, and says to repeat it', async () => {
    const stale = new ORPCError('session.reauthentication-required', { status: 401 })
    await write(() => Promise.reject(stale), { failure: false })

    expect(signInAgain).toHaveBeenCalledOnce()
    expect(notifySignInAgain).toHaveBeenCalledOnce()
    // Not the catalog's message for the refusal, which offers Google.
    expect(notifyFailure).not.toHaveBeenCalled()
  })
})
