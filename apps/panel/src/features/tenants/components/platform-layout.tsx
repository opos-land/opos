import { Outlet } from 'react-router'
import { ConventionSwitcher } from './area-switcher'
import { PanelFrame } from './panel-frame'

/** The frame of the pages above any convention: the convention picker and the account page. */
export function PlatformLayout() {
  return (
    <PanelFrame switcher={<ConventionSwitcher />}>
      <Outlet />
    </PanelFrame>
  )
}
