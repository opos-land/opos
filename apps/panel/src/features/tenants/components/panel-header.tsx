import { Trans, useLingui } from '@lingui/react/macro'
import { Link, useMatch, useNavigate } from 'react-router'
import { AccountMenu } from '../../account'
import { usePermissionStore } from '../model/permissions'

const button = 'rounded-box border-line hover:border-ink border px-3 py-1 text-sm'

/**
 * The top bar (PLAN.md 8): the panel's name, the convention (a switch for a member of several),
 * the way between an edition and the convention settings for a member who may open them, and the
 * account menu.
 */
export function PanelHeader({
  tenantSlug,
  conventionSettings = false,
}: {
  tenantSlug?: string
  conventionSettings?: boolean
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const memberships = usePermissionStore((state) => state.memberships) ?? []
  const inSettings = Boolean(useMatch('/:tenantSlug/settings/*'))
  const current = memberships.find((m) => m.tenant.slug === tenantSlug)

  return (
    <header className="border-line bg-surface flex flex-wrap items-center gap-4 border-b px-4 py-3">
      <Link to="/" className="font-semibold">
        <Trans>OPOS panel</Trans>
      </Link>
      {memberships.length > 1 ? (
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
      ) : (
        current && <span className="text-muted text-sm">{current.tenant.name}</span>
      )}
      <div className="ml-auto flex items-center gap-4">
        {tenantSlug &&
          conventionSettings &&
          (inSettings ? (
            <Link to={`/${tenantSlug}`} className={button}>
              <Trans>Back to the edition</Trans>
            </Link>
          ) : (
            <Link to={`/${tenantSlug}/settings`} className={button}>
              <Trans>Convention settings</Trans>
            </Link>
          ))}
        <AccountMenu />
      </div>
    </header>
  )
}
