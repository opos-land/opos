import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile } from './use-mobile'

/** A media query list whose change listeners the test can call. */
function stubMedia() {
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  return listeners
}

const resize = (width: number) => {
  window.innerWidth = width
}

afterEach(() => {
  vi.restoreAllMocks()
  resize(1024)
})

describe('useIsMobile', () => {
  it('is false on a wide screen and true under 768 px', () => {
    stubMedia()
    resize(1024)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)

    resize(767)
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })

  it('follows the screen when the media query changes, and stops listening once unmounted', () => {
    const listeners = stubMedia()
    resize(1024)
    const { result, unmount } = renderHook(() => useIsMobile())

    resize(600)
    act(() => listeners.forEach((listener) => listener()))
    expect(result.current).toBe(true)

    unmount()
    expect(listeners.size).toBe(0)
  })
})
