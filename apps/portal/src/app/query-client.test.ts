import { msg } from '@lingui/core/macro'
import { ORPCError } from '@orpc/client'
import { MutationObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyFailure, notifySuccess } from '../shared/lib/notify'
import { createQueryClient } from './query-client'

vi.mock('../shared/lib/notify', () => ({ notifySuccess: vi.fn(), notifyFailure: vi.fn() }))

const write = (mutationFn: () => Promise<unknown>, meta?: Record<string, unknown>) =>
  new MutationObserver(createQueryClient(), { mutationFn, meta }).mutate().catch(() => undefined)

beforeEach(() => {
  vi.mocked(notifySuccess).mockReset()
  vi.mocked(notifyFailure).mockReset()
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
})
