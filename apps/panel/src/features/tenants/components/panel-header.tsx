import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useNavigate } from 'react-router'
import { AccountMenu } from '../../account'
import { usePermissionStore } from '../model/permissions'

/** The top bar: the panel's name, the convention switcher (PRODUCT.md 5.5), the account menu. */
export function PanelHeader({ tenantSlug }: { tenantSlug?: string }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const memberships = usePermissionStore((state) => state.memberships) ?? []

  return (
    <header className="border-line bg-surface flex flex-wrap items-center gap-4 border-b px-4 py-3">
      <Link to="/" className="font-semibold">
        <Trans>OPOS panel</Trans>
      </Link>
      {memberships.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">
            <Trans>Convention</Trans>
          </span>
          <select
            className="rounded-box border-line bg-surface border px-2 py-1 text-sm"
            value={tenantSlug ?? ''}
            onChange={(event) => void navigate(`/${event.target.value}`)}
          >
            {!tenantSlug && <option value="">{t`Choose a convention`}</option>}
            {memberships.map((m) => (
              <option key={m.tenant.id} value={m.tenant.slug}>
                {m.tenant.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ml-auto">
        <AccountMenu />
      </div>
    </header>
  )
}
