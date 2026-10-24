import { describe, expect, it, vi } from 'vitest'
import { type TenantContextService } from '../../common/als/tenant-context.service'
import { type GlobalDbService } from '../../common/database/global-db.service'
import { type ApiError } from '../../common/errors/api-error'
import { type AuthAdminClient } from '../auth/auth-admin.client'
import { AccountDeletionService, RECENT_SIGN_IN_SECONDS } from './account-deletion.service'

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001'

function service({
  recent = true,
  lastHead = [false],
  deleteUser = () => Promise.resolve(true),
}: {
  recent?: boolean
  /** The answers of consecutive last-head checks. */
  lastHead?: boolean[]
  deleteUser?: () => Promise<boolean>
} = {}) {
  const answers = [...lastHead]
  const context = {
    signedInWithin: vi.fn(() => recent),
    account: () => ({ id: ACCOUNT_ID }),
  }
  const global = { ownLastHead: vi.fn(() => Promise.resolve(answers.shift() ?? false)) }
  const admin = { deleteUser: vi.fn(deleteUser) }
  const deletion = new AccountDeletionService(
    context as unknown as TenantContextService,
    global as unknown as GlobalDbService,
    admin as unknown as AuthAdminClient,
  )
  return { deletion, context, global, admin }
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: ApiError) => [error.getStatus(), error.code],
  )

describe('AccountDeletionService', () => {
  it('deletes the user of the signed-in account', async () => {
    const { deletion, context, admin } = service()

    await deletion.deleteCurrent()

    expect(context.signedInWithin).toHaveBeenCalledWith(RECENT_SIGN_IN_SECONDS)
    expect(admin.deleteUser).toHaveBeenCalledWith(ACCOUNT_ID)
  })

  it('asks for a recent sign-in before anything else', async () => {
    const { deletion, global, admin } = service({ recent: false })

    expect(await codeOf(deletion.deleteCurrent())).toEqual([
      401,
      'session.reauthentication-required',
    ])
    expect(global.ownLastHead).not.toHaveBeenCalled()
    expect(admin.deleteUser).not.toHaveBeenCalled()
  })

  it('refuses a last head without calling Supabase Auth', async () => {
    const { deletion, admin } = service({ lastHead: [true] })

    expect(await codeOf(deletion.deleteCurrent())).toEqual([409, 'membership.last-head'])
    expect(admin.deleteUser).not.toHaveBeenCalled()
  })

  it('answers 409 when the head trigger refused a delete that raced a demotion', async () => {
    const { deletion } = service({
      lastHead: [false, true],
      deleteUser: () => Promise.reject(new Error('Unexpected failure')),
    })

    expect(await codeOf(deletion.deleteCurrent())).toEqual([409, 'membership.last-head'])
  })

  it('passes any other failure on', async () => {
    const failure = new Error('Unexpected failure')
    const { deletion } = service({ deleteUser: () => Promise.reject(failure) })

    await expect(deletion.deleteCurrent()).rejects.toBe(failure)
  })

  it('treats a user deleted meanwhile as deleted', async () => {
    const { deletion } = service({ deleteUser: () => Promise.resolve(false) })

    await expect(deletion.deleteCurrent()).resolves.toBeUndefined()
  })
})
