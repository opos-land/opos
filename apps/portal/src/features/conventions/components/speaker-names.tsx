import { useLingui } from '@lingui/react/macro'
import { type PublicProgramItem } from '@opos/contract'
import { publicName } from '@opos/i18n/names'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { profilePath } from '../../../shared/config/routes'
import { linkClass } from '../../../shared/ui'

/**
 * The speakers of a programme item by their public names, in the reader's language, "Anon" for
 * one with no part of a name. A name leads to the speaker's profile while that is published
 * (docs/specs/0016-public-profile.md, N5 and P11).
 */
export function SpeakerNames({ speakers }: { speakers: PublicProgramItem['speakers'] }) {
  const { i18n } = useLingui()
  return (
    <>
      {speakers.map((speaker, index) => {
        const name = publicName(i18n, speaker)
        return (
          // A speaker has no identifier here: the list comes in one order and is shown in it.
          <Fragment key={index}>
            {index > 0 && ', '}
            {speaker.profileId ? (
              <Link to={profilePath(speaker.profileId)} className={linkClass}>
                {name}
              </Link>
            ) : (
              name
            )}
          </Fragment>
        )
      })}
    </>
  )
}
