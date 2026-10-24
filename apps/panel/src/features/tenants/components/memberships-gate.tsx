import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect } from 'react'
import { ErrorMessage, LoadingView } from '../../../shared/ui'
import { membershipsOptions } from '../api/tenants'
import { setMemberships } from '../model/permissions'

/** Fills the permission store from GET /me/memberships after sign-in (PLAN.md 8). */
export function MembershipsGate({ children }: { children: ReactNode }) {
  const memberships = useQuery(membershipsOptions())

  useEffect(() => {
    if (memberships.data) setMemberships(memberships.data)
  }, [memberships.data])

  if (memberships.isError) {
    return (
      <div className="p-8">
        <ErrorMessage error={memberships.error} />
      </div>
    )
  }
  if (!memberships.data) return <LoadingView />
  return children
}
