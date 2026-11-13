import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { I18nProvider } from '@lingui/react'
import { ORPCError } from '@orpc/client'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from '../ui/toast'
import { notifyFailure, notifySignInAgain, notifySuccess } from './notify'
import { useSession } from './session'

vi.mock('../ui/toast', () => ({ toast: { add: vi.fn() } }))

/** A notification's title as it reads once shown, in the language active then. */
const text = (title: ReactNode) =>
  renderToStaticMarkup(createElement(I18nProvider, { i18n }, title))

const added = () =>
  vi.mocked(toast.add).mock.calls.map(([options]) => ({ ...options, title: text(options.title) }))

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
})

beforeEach(() => {
  vi.mocked(toast.add).mockReset()
  useSession.setState({ status: 'ready', account: null })
})

describe('notifySuccess', () => {
  it('says the changes are saved, unless the write names its own success', () => {
    notifySuccess(undefined, null)
    notifySuccess({ success: msg`The member is removed from the team.` }, null)

    expect(added()).toEqual([
      { type: 'success', title: 'The changes are saved.' },
      { type: 'success', title: 'The member is removed from the team.' },
    ])
  })

  it('words the success from what the write returned', () => {
    const named = (edition: { name: string }) => {
      const name = edition.name
      return msg`${name} is created.`
    }
    notifySuccess({ success: named }, { name: 'Spring edition' })

    expect(added()).toEqual([{ type: 'success', title: 'Spring edition is created.' }])
  })

  it('words the notification in the language active when it shows, not when it was added', () => {
    const saved = msg`The changes are saved.`
    i18n.load('pl', { [saved.id]: 'Zmiany zostały zapisane.' })
    notifySuccess(undefined, null)

    i18n.activate('pl')
    try {
      expect(added()[0]?.title).toBe('Zmiany zostały zapisane.')
    } finally {
      i18n.activate('en')
    }
  })

  it('stays silent for a write whose screen shows the result itself', () => {
    notifySuccess({ success: false }, null)

    expect(added()).toEqual([])
  })
})

describe('notifyFailure', () => {
  it('warns of a refusal the member can act on, until it is closed', () => {
    notifyFailure(new ORPCError('member.above-own', { status: 403 }))

    expect(added()).toEqual([
      {
        type: 'warning',
        title: 'You cannot grant permissions higher than your own.',
        timeout: 0,
        priority: 'low',
      },
    ])
  })

  it('reports a failure of the service or the network as an error, announced at once', () => {
    notifyFailure(new ORPCError('server.error', { status: 500 }))
    notifyFailure(new TypeError('Failed to fetch'))

    expect(added().map(({ type, timeout, priority }) => [type, timeout, priority])).toEqual([
      ['error', 0, 'high'],
      ['error', 0, 'high'],
    ])
  })

  it('stays silent for a write whose screen is its failure', () => {
    notifyFailure(new ORPCError('invitation.used', { status: 409 }), { failure: false })

    expect(added()).toEqual([])
  })

  it('treats a 401 the refresh could not settle as a failure of the service', () => {
    useSession.setState({ status: 'ready', account: { id: 'a' } as never })
    notifyFailure(new ORPCError('session.invalid', { status: 401 }))

    expect(added()).toEqual([
      {
        type: 'error',
        title: 'The service is temporarily unavailable. Try again in a moment.',
        timeout: 0,
        priority: 'high',
      },
    ])
  })
})

describe('notifySignInAgain', () => {
  it('says that the sign-in is too old and the action has to be repeated, and stays', () => {
    notifySignInAgain()

    expect(added()).toEqual([
      {
        type: 'warning',
        title:
          'Your sign-in is too old for this action. Sign in again with your password and the code, then repeat it.',
        timeout: 0,
        priority: 'low',
      },
    ])
  })
})
