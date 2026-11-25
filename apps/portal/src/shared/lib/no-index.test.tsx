import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useNoIndex } from './no-index'
import { SERVER_HEAD } from './server-head'

function Page() {
  useNoIndex()
  return null
}

const robots = () => [...document.head.querySelectorAll('meta[name="robots"]')]

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

describe('useNoIndex', () => {
  it('asks search engines to leave the page out for as long as it is shown', () => {
    const view = render(<Page />)

    expect(robots().map((meta) => meta.getAttribute('content'))).toEqual(['noindex'])

    view.unmount()
    expect(robots()).toEqual([])
  })

  it('takes over from what the server wrote for the page, so the page asks once', () => {
    const written = document.createElement('meta')
    written.name = 'robots'
    written.content = 'noindex'
    written.setAttribute(SERVER_HEAD, '')
    document.head.append(written)

    const view = render(<Page />)

    expect(robots()).toHaveLength(1)
    expect(written.isConnected).toBe(false)

    view.unmount()
    expect(robots()).toEqual([])
  })
})
