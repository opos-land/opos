import { describe, expect, it } from 'vitest'
import {
  adminProfileOptions,
  profileReportOptions,
  profileReportsOptions,
  takenDownProfilesOptions,
} from './profiles'

// What these read changes outside the admin application: anyone sends a report, and an account
// changes its profile, uploads an avatar and asks for a review. A read kept as fresh would show
// the admin a profile as it was (docs/specs/0016-public-profile.md, T2 and T8).
describe('the reads of profiles and their reports', () => {
  it.each([
    ['the open reports', profileReportsOptions('open')],
    ['the closed reports', profileReportsOptions('closed')],
    ['a report', profileReportOptions('00000000-0000-4000-8000-000000000001')],
    ['the profiles taken down', takenDownProfilesOptions()],
    ['a profile', adminProfileOptions('00000000-0000-4000-8000-000000000002')],
  ])('never count %s as fresh, so each opening reads again', (_name, options) => {
    expect(options.staleTime).toBe(0)
  })

  it('keeps the open and the closed reports apart', () => {
    expect(profileReportsOptions('open').queryKey).not.toEqual(
      profileReportsOptions('closed').queryKey,
    )
  })
})
