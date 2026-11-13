import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  chooseSignedOutTheme,
  isTheme,
  signedOutTheme,
  THEME_STORAGE_KEY,
  useShownTheme,
} from './theme'

/** A system colour scheme the test can switch, with the change listeners it holds. */
function stubSystem(dark: boolean) {
  const listeners = new Set<() => void>()
  const system = { dark }
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        media: query,
        get matches() {
          return query === '(prefers-color-scheme: dark)' && system.dark
        },
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  )
  const switchTo = (next: boolean) => {
    system.dark = next
    listeners.forEach((listener) => listener())
  }
  return { listeners, switchTo }
}

const root = document.documentElement
const shown = () => ({ dark: root.classList.contains('dark'), scheme: root.style.colorScheme })

afterEach(() => {
  applyTheme('light')
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('applyTheme', () => {
  it('shows the chosen theme whatever the system prefers', () => {
    stubSystem(false)
    applyTheme('dark')
    expect(shown()).toEqual({ dark: true, scheme: 'dark' })

    stubSystem(true)
    applyTheme('light')
    expect(shown()).toEqual({ dark: false, scheme: 'light' })
  })

  it('shows the system theme with no choice, and follows it as it changes', () => {
    const { switchTo } = stubSystem(true)
    applyTheme(null)
    expect(shown()).toEqual({ dark: true, scheme: 'dark' })

    switchTo(false)
    expect(shown()).toEqual({ dark: false, scheme: 'light' })
  })

  it('stops following the system once a theme is chosen', () => {
    const { listeners, switchTo } = stubSystem(false)
    applyTheme(null)
    expect(listeners.size).toBe(1)

    applyTheme('light')
    expect(listeners.size).toBe(0)
    switchTo(true)
    expect(shown()).toEqual({ dark: false, scheme: 'light' })
  })

  it('keeps one listener when the system theme is applied again', () => {
    const { listeners } = stubSystem(false)
    applyTheme(null)
    applyTheme(null)

    expect(listeners.size).toBe(1)
  })
})

describe('useShownTheme', () => {
  it('names the theme on screen, the system one included, as it changes', () => {
    const { switchTo } = stubSystem(false)
    const { result } = renderHook(() => useShownTheme())
    expect(result.current).toBe('light')

    act(() => applyTheme('dark'))
    expect(result.current).toBe('dark')

    act(() => applyTheme(null))
    expect(result.current).toBe('light')
    act(() => switchTo(true))
    expect(result.current).toBe('dark')
  })
})

describe('the signed-out theme', () => {
  it('is none until one is chosen in this browser', () => {
    expect(signedOutTheme()).toBeNull()
  })

  it('is kept in this browser and shown once chosen', () => {
    stubSystem(false)
    chooseSignedOutTheme('dark')

    expect(signedOutTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(shown()).toEqual({ dark: true, scheme: 'dark' })
  })

  it('ignores a stored value that is no theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'blue')

    expect(signedOutTheme()).toBeNull()
  })

  it('still shows the theme where the browser keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    chooseSignedOutTheme('dark')

    expect(shown()).toEqual({ dark: true, scheme: 'dark' })
  })
})

describe('isTheme', () => {
  it('accepts the themes an account can choose, nothing else', () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('system')).toBe(false)
    expect(isTheme(null)).toBe(false)
  })
})
