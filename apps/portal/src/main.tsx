import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { Providers } from './app/providers'
import { router } from './app/router'
import { loadLocale, pickLocale } from './shared/lib/i18n'
import { startSession } from './shared/lib/session'
import './styles.css'

// The browser's language until the account's is known (PLAN.md 6); the session is restored
// meanwhile, and a page that needs it shows a loading view until it is (PLAN.md 9).
void startSession()
void loadLocale(pickLocale()).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
})
