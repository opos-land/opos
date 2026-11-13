import { msg } from '@lingui/core/macro'
import { ORPCError } from '@orpc/client'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyFailure, notifySuccess } from '../shared/lib/notify'
import { markForbidden } from '../shared/lib/forbidden'
import { createQueryClient } from './query-client'

vi.mock('../shared/lib/notify', () => ({ notifySuccess: vi.fn(), notifyFailure: vi.fn() }))
vi.mock('../shared/lib/forbidden', () => ({ markForbidden: vi.fn() }))
vi.mock('../features/tenants', () => ({
  membershipsKey: () => ['account', 'me', 'memberships'],
}))

const write = (mutationFn: () => Promise<unknown>, meta?: Record<string, unknown>) =>
  new MutationObserver(createQueryClient(), { mutationFn, meta }).mutate().catch(() => undefined)

beforeEach(() => {
  vi.mocked(notifySuccess).mockReset()
  vi.mocked(notifyFailure).mockReset()
  vi.mocked(markForbidden).mockReset()
})

describe('createQueryClient', () => {
  it('notifies the success of every write, with what the write returned', async () => {
    const meta = { success: msg`The member is removed from the team.` }
    await write(() => Promise.resolve({ id: 'm-1' }), meta)

    expect(notifySuccess).toHaveBeenCalledWith(meta, { id: 'm-1' })
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it('notifies the failure of every write', async () => {
    const refusal = new ORPCError('member.above-own', { status: 403 })
    const meta = { failure: false }
    await write(() => Promise.reject(refusal), meta)

    expect(notifyFailure).toHaveBeenCalledWith(refusal, meta)
    expect(notifySuccess).not.toHaveBeenCalled()
  })

  // The convention was suspended under an open page: the memberships are read again, and the
  // tenant's layout gives way to the message that it is suspended.
  it('reads the memberships again when a write finds the convention suspended, and says so', async () => {
    const suspended = new ORPCError('tenant.suspended', { status: 403 })
    const client = createQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await new MutationObserver(client, { mutationFn: () => Promise.reject(suspended) })
      .mutate()
      .catch(() => undefined)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'me', 'memberships'] })
    expect(notifyFailure).toHaveBeenCalledWith(suspended, undefined)
    expect(markForbidden).not.toHaveBeenCalled()
  })

  it('reads the memberships again when a read finds the convention suspended', async () => {
    const client = createQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await new QueryObserver(client, {
      queryKey: ['tenant', 'convention-a', 'x'],
      queryFn: () => Promise.reject(new ORPCError('tenant.suspended', { status: 403 })),
      retry: false,
    }).refetch()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'me', 'memberships'] })
    expect(markForbidden).not.toHaveBeenCalled()
  })

  it('leaves a plain 403 to the "no permissions" screen', async () => {
    await write(() => Promise.reject(new ORPCError('permission.denied', { status: 403 })))

    expect(markForbidden).toHaveBeenCalled()
    expect(notifyFailure).not.toHaveBeenCalled()
  })
})
