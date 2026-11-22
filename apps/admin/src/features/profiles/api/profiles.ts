import { accountApi } from '../../../shared/lib/api'

// The admin's side of the public profile (docs/specs/0016-public-profile.md, T1-T14).

/** The key of everything read through the admin routes, for a write to mark stale. */
export const adminKey = () => accountApi.admin.key()

/** The reports of profiles, open or closed, newest first. */
export const profileReportsOptions = (state: 'open' | 'closed') =>
  accountApi.admin.profileReports.queryOptions({ input: { query: { state, limit: 100 } } })

export const profileReportOptions = (reportId: string) =>
  accountApi.admin.profileReport.queryOptions({ input: { params: { reportId } } })

/** The profiles taken down, those asking for a review first. */
export const takenDownProfilesOptions = () => accountApi.admin.takenDownProfiles.queryOptions()

/** The profile of an account as it is now, with its reports. */
export const adminProfileOptions = (accountId: string) =>
  accountApi.admin.profile.queryOptions({ input: { params: { accountId } } })

export const findAccountOptions = () => accountApi.admin.findAccount.mutationOptions()
export const closeProfileReportOptions = () => accountApi.admin.closeProfileReport.mutationOptions()
export const takeDownProfileOptions = () => accountApi.admin.takeDownProfile.mutationOptions()
export const restoreProfileOptions = () => accountApi.admin.restoreProfile.mutationOptions()
export const clearAccountNameOptions = () => accountApi.admin.clearAccountName.mutationOptions()
