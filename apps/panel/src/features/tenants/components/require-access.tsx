import { type ReactNode } from 'react'
import { NoPermissionView } from '../../../shared/ui'

/** A page the member's permissions do not cover ends on the "no permissions" screen. */
export function RequireAccess({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return allowed ? children : <NoPermissionView />
}
