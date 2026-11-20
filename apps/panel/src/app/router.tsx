import { createBrowserRouter, Outlet } from 'react-router'
import { AccountLocale, AccountPage } from '../features/account'
import { BrandingPage } from '../features/branding'
import {
  AddOnPage,
  AddOnsPage,
  CustomFieldPage,
  NewAddOnPage,
  NewCustomFieldPage,
  MerchandiseItemPage,
  MerchandisePage,
  TicketHoldersPage,
  TicketTypePage,
  TicketTypesPage,
} from '../features/catalog'
import {
  ConfirmPage,
  ForgotPasswordPage,
  InvitationPage,
  LoginPage,
  MfaGate,
  MfaPage,
  RequireSession,
} from '../features/auth'
import {
  ConventionEntryPage,
  EditionDashboardPage,
  EditionLayout,
  EditionSettingsPage,
  EditionsPage,
  NewEditionPage,
} from '../features/editions'
import { ManualOrderPage, OrderPage, OrdersPage, ProductionNumbersPage } from '../features/orders'
import { DiscountCodePage, DiscountCodesPage, NewDiscountCodePage } from '../features/discounts'
import { SalesPage } from '../features/sales'
import { NewScannerPage, ScannerPage, ScannersPage } from '../features/scanner'
import { NewProgramItemPage, ProgramItemPage, ProgramPage } from '../features/program'
import {
  EditionDocumentsPage,
  EditionShopPage,
  NewConsentPage,
  NewDocumentPage,
  ShopSettingsPage,
} from '../features/shop'
import { EditionAccessPage, InvitePage, MemberPage, TeamPage } from '../features/team'
import {
  AreaFrame,
  ConventionLayout,
  MembershipsGate,
  PlatformLayout,
  SettingsPage,
  TenantLayout,
  TenantPickerPage,
} from '../features/tenants'
import { AccountTheme } from '../features/theme'
import { useSession } from '../shared/lib/session'
import { NotFoundView, SidebarProvider, TooltipProvider } from '../shared/ui'

/**
 * Pages for a signed-in member, with the permission store filled. Each frames itself in the
 * sidebar, whose open or collapsed state is held here, across pages and areas.
 */
function SignedIn() {
  return (
    <RequireSession>
      <AccountLocale />
      <MembershipsGate>
        <TooltipProvider>
          <SidebarProvider>
            <Outlet />
          </SidebarProvider>
        </TooltipProvider>
      </MembershipsGate>
    </RequireSession>
  )
}

/**
 * Every screen, with `MfaGate` leading the sign-in pages of a pending session to `/auth/mfa`, in
 * the signed-in account's theme on any page.
 */
function Root() {
  const account = useSession((state) => state.account)
  return (
    <>
      {account && <AccountTheme />}
      <MfaGate />
      <Outlet />
    </>
  )
}

// The fixed top-level paths are reserved tenant slugs, so /:tenantSlug never
// shadows them.
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/auth/confirm', element: <ConfirmPage /> },
      { path: '/auth/mfa', element: <MfaPage /> },
      { path: '/invitation', element: <InvitationPage /> },
      // The scanner: a phone with no account signed in; `scanner` is a reserved tenant slug.
      { path: '/scanner', element: <ScannerPage /> },
      {
        element: <SignedIn />,
        children: [
          {
            // Above any convention; `account` is a reserved tenant slug.
            element: <PlatformLayout />,
            children: [
              { path: '/', element: <TenantPickerPage /> },
              { path: '/account', element: <AccountPage /> },
            ],
          },
          {
            path: '/:tenantSlug',
            element: <TenantLayout />,
            children: [
              {
                // Entering the convention opens the member's edition.
                element: <AreaFrame />,
                children: [
                  { index: true, element: <ConventionEntryPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
              {
                // The convention settings: what belongs to the whole convention.
                path: 'settings',
                element: <ConventionLayout />,
                children: [
                  { index: true, element: <SettingsPage /> },
                  { path: 'editions', element: <EditionsPage /> },
                  { path: 'editions/new', element: <NewEditionPage /> },
                  { path: 'team', element: <TeamPage /> },
                  { path: 'team/invite', element: <InvitePage /> },
                  { path: 'team/:membershipId', element: <MemberPage /> },
                  { path: 'branding', element: <BrandingPage /> },
                  { path: 'shop', element: <ShopSettingsPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
              {
                // The edition area: everything about one edition, its settings included.
                path: 'editions/:editionSlug',
                element: <EditionLayout />,
                children: [
                  { index: true, element: <EditionDashboardPage /> },
                  { path: 'program', element: <ProgramPage /> },
                  { path: 'program/new', element: <NewProgramItemPage /> },
                  { path: 'program/:programItemId', element: <ProgramItemPage /> },
                  { path: 'shop', element: <EditionShopPage /> },
                  { path: 'documents', element: <EditionDocumentsPage /> },
                  { path: 'documents/new', element: <NewDocumentPage /> },
                  { path: 'documents/consents/new', element: <NewConsentPage /> },
                  { path: 'orders', element: <OrdersPage /> },
                  { path: 'orders/new', element: <ManualOrderPage /> },
                  { path: 'orders/:orderId', element: <OrderPage /> },
                  { path: 'production-numbers', element: <ProductionNumbersPage /> },
                  { path: 'sales', element: <SalesPage /> },
                  { path: 'scanners', element: <ScannersPage /> },
                  { path: 'scanners/new', element: <NewScannerPage /> },
                  { path: 'ticket-types', element: <TicketTypesPage /> },
                  { path: 'ticket-types/new', element: <TicketTypePage /> },
                  { path: 'ticket-types/:ticketTypeId', element: <TicketTypePage /> },
                  { path: 'add-ons', element: <AddOnsPage /> },
                  { path: 'add-ons/new', element: <NewAddOnPage /> },
                  { path: 'add-ons/:addOnId', element: <AddOnPage /> },
                  { path: 'merchandise', element: <MerchandisePage /> },
                  { path: 'merchandise/new', element: <MerchandiseItemPage /> },
                  { path: 'merchandise/:itemId', element: <MerchandiseItemPage /> },
                  { path: 'discount-codes', element: <DiscountCodesPage /> },
                  { path: 'discount-codes/new', element: <NewDiscountCodePage /> },
                  { path: 'discount-codes/:codeId', element: <DiscountCodePage /> },
                  { path: 'ticket-holders', element: <TicketHoldersPage /> },
                  { path: 'ticket-holders/custom-fields/new', element: <NewCustomFieldPage /> },
                  {
                    path: 'ticket-holders/custom-fields/:fieldId',
                    element: <CustomFieldPage />,
                  },
                  { path: 'access', element: <EditionAccessPage /> },
                  { path: 'settings', element: <EditionSettingsPage /> },
                  { path: '*', element: <NotFoundView /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
