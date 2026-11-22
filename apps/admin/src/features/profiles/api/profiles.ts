import { accountApi } from '../../../shared/lib/api'

// The admin's side of the public profile (docs/specs/0016-public-profile.md, T1-T14).

/** The key of everything read through the admin routes, for a write to mark stale. */
export const adminKey = () => accountApi.admin.key()

// What these read changes outside this application: anyone sends a report, and an account changes
// its profile, uploads an avatar and asks for a review. None of it is kept as fresh, so each
// opening of a screen reads it again and the admin judges a profile as it is now.
const READ_AGAIN = { staleTime: 0 }

/** The reports of profiles, open or closed, newest first. */
export const profileReportsOptions = (state: 'open' | 'closed') =>
  accountApi.admin.profileReports.queryOptions({
    input: { query: { state, limit: 100 } },
    ...READ_AGAIN,
  })

export const profileReportOptions = (reportId: string) =>
  accountApi.admin.profileReport.queryOptions({ input: { params: { reportId } }, ...READ_AGAIN })

/** The profiles taken down, those asking for a review first. */
export const takenDownProfilesOptions = () =>
  accountApi.admin.takenDownProfiles.queryOptions(READ_AGAIN)

/** The profile of an account as it is now, with its reports. */
export const adminProfileOptions = (accountId: string) =>
  accountApi.admin.profile.queryOptions({ input: { params: { accountId } }, ...READ_AGAIN })

export const findAccountOptions = () => accountApi.admin.findAccount.mutationOptions()
export const closeProfileReportOptions = () => accountApi.admin.closeProfileReport.mutationOptions()
export const takeDownProfileOptions = () => accountApi.admin.takeDownProfile.mutationOptions()
export const restoreProfileOptions = () => accountApi.admin.restoreProfile.mutationOptions()
export const clearAccountNameOptions = () => accountApi.admin.clearAccountName.mutationOptions()
