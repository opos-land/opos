import { Trans } from '@lingui/react/macro'
import { Link } from 'react-router'
import { TERMS_PATH } from '../../../shared/config/routes'
import { linkClass } from '../../../shared/ui'

/** The link to the platform's terms, as a sentence names them. */
export function TermsLink() {
  return (
    <Link to={TERMS_PATH} className={linkClass}>
      <Trans>the terms</Trans>
    </Link>
  )
}
