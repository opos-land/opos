import { create } from 'zustand'

/**
 * Set when the API answers `permission.denied` (PLAN.md 8): the page gives way to the "no
 * permissions" screen until the member navigates elsewhere.
 */
export const useForbidden = create<{ forbidden: boolean }>(() => ({ forbidden: false }))

export const markForbidden = () => useForbidden.setState({ forbidden: true })
export const clearForbidden = () => useForbidden.setState({ forbidden: false })
