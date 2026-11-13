import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../common/errors/api-error'
import { TwoFactorResetService } from './two-factor-reset.service'

const account = { id: 'account-1', email: 'person@example.test', locale: 'pl' }

function setup(overrides: { codes?: () => Promise<void>; mail?: () => Promise<void> } = {}) {
  const calls: string[] = []
  const step =
    <T>(name: string, result: T) =>
    () => {
      calls.push(name)
      return Promise.resolve(result)
    }
  const admin = {
    beginTwoFactorReset: vi.fn(step('begin', account)),
    deleteUnusedRecoveryCodes: vi.fn(overrides.codes ?? step('codes', undefined)),
  }
  const auth = {
    factorIds: vi.fn(step('factors', ['factor-1', 'factor-2'])),
    deleteFactor: vi.fn(step('delete factor', true)),
    noticeLocale: vi.fn(() => Promise.resolve('pl' as const)),
  }
  const mail = { sendNoticeEmail: vi.fn(overrides.mail ?? step('mail', undefined)) }
  const service = new TwoFactorResetService(admin as never, auth as never, mail as never)
  return { service, calls, admin, auth, mail }
}

describe('TwoFactorResetService', () => {
  it('commits the entry of the log first, then removes the factors, the codes, and mails', async () => {
    const { service, calls, admin, auth, mail } = setup()

    expect(await service.reset('Person@Example.test', 'admin-1')).toEqual({ emailSent: true })

    expect(calls).toEqual(['begin', 'factors', 'delete factor', 'delete factor', 'codes', 'mail'])
    expect(admin.beginTwoFactorReset).toHaveBeenCalledWith('Person@Example.test', 'admin-1')
    expect(auth.deleteFactor.mock.calls).toEqual([
      ['account-1', 'factor-1'],
      ['account-1', 'factor-2'],
    ])
    expect(mail.sendNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'person@example.test', locale: 'pl' }),
    )
  })

  it('touches nothing when the account is refused', async () => {
    const { service, admin, auth, mail } = setup()
    admin.beginTwoFactorReset.mockRejectedValueOnce(
      new ApiError(409, 'account.is-admin', 'The account holds the admin role'),
    )

    await expect(service.reset('admin@example.test', 'admin-1')).rejects.toMatchObject({
      code: 'account.is-admin',
    })

    expect(auth.factorIds).not.toHaveBeenCalled()
    expect(admin.deleteUnusedRecoveryCodes).not.toHaveBeenCalled()
    expect(mail.sendNoticeEmail).not.toHaveBeenCalled()
  })

  it('sends no notice when Supabase Auth refuses to remove a factor', async () => {
    const { service, auth, mail } = setup()
    auth.deleteFactor.mockRejectedValueOnce(new Error('auth down'))

    await expect(service.reset('person@example.test', 'admin-1')).rejects.toThrow('auth down')

    expect(mail.sendNoticeEmail).not.toHaveBeenCalled()
  })

  it('still mails the person when the unused codes cannot be removed', async () => {
    const { service, mail } = setup({ codes: () => Promise.reject(new Error('codes store down')) })

    expect(await service.reset('person@example.test', 'admin-1')).toEqual({ emailSent: true })

    expect(mail.sendNoticeEmail).toHaveBeenCalledOnce()
  })

  it('answers that the notice was not sent, and lets the reset stand', async () => {
    const { service, auth } = setup({ mail: () => Promise.reject(new Error('smtp down')) })

    expect(await service.reset('person@example.test', 'admin-1')).toEqual({ emailSent: false })

    expect(auth.deleteFactor).toHaveBeenCalledTimes(2)
  })
})
